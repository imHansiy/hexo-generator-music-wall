(() => {
  "use strict";

  const STORAGE_NOW_PLAYING = "music-clone:nowPlaying";
  const STORAGE_QUEUE = "music-clone:queue";
  const STORAGE_FAVORITES = "music-clone:favorites";
  const STORAGE_LOOP = "music-clone:floatingPlayerLoop";
  const STORAGE_POSITION = "music-clone:floatingPlayerPosition";
  const STORAGE_LYRICS = "music-clone:lyrics";
  const PLAYBACK_COMMAND_EVENT = "hexo-music-wall:playback-command";
  const SYNTH_DURATION = 96;
  const CONFIG = window.__HEXO_MUSIC_WALL_GLOBAL_CONFIG__ || {};
  const MUSIC_PATH = normalizePath(CONFIG.musicPath || "/music/");
  const NAVIGATION_MODE = ["auto", "plugin", "native"].includes(CONFIG.navigationMode) ? CONFIG.navigationMode : "auto";
  const CONTENT_SELECTOR = String(CONFIG.contentSelector || "").trim();
  const ASSET_BASE = String(CONFIG.assetBase || `${MUSIC_PATH}assets`).replace(/\/+$/, "");
  const ASSET_SUFFIX = CONFIG.assetVersion ? `?v=${encodeURIComponent(CONFIG.assetVersion)}` : "";
  const sharedAudio = window.__HEXO_MUSIC_WALL_SHARED_AUDIO__;
  const playbackRuntime = window.__HEXO_MUSIC_WALL_PLAYBACK_RUNTIME__ || { hasPlaybackStarted: false };
  window.__HEXO_MUSIC_WALL_PLAYBACK_RUNTIME__ = playbackRuntime;

  const state = {
    audio: sharedAudio instanceof HTMLMediaElement ? sharedAudio : new Audio(),
    audioUrl: sharedAudio instanceof HTMLMediaElement ? (sharedAudio.currentSrc || sharedAudio.src || "") : "",
    data: readJson(STORAGE_NOW_PLAYING, null),
    queue: normalizeStoredQueue(readJson(STORAGE_QUEUE, [])),
    collapsed: true,
    favorites: readFavoriteSet(),
    loop: localStorage.getItem(STORAGE_LOOP) === "1",
    lyricsEnabled: localStorage.getItem(STORAGE_LYRICS) !== "false",
    lyrics: [],
    lyricsTrackId: "",
    playing: false,
    loading: false,
    mode: "idle",
    switching: false,
    seeking: false,
    requestId: 0,
    status: "",
    lastPersistAt: 0,
    controlPress: { action: "", at: 0 },
    musicPageActive: Boolean(document.querySelector(".music-wall-embed")),
    lastTickAt: 0,
    booting: false,
    root: null,
    lyricsRoot: null,
    drag: {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
      moved: false,
      suppressClick: false,
    },
    synth: {
      ctx: null,
      gain: null,
      nodes: [],
      startedAt: 0,
      clockStartedAt: 0,
      offset: 0,
      playing: false,
    },
  };

  window.__HEXO_MUSIC_WALL_SHARED_AUDIO__ = state.audio;

  installThemePjaxGuard();
  installPersistentNavigation();

  if (!document.querySelector(".music-wall-embed")) bootGlobalPlayer();
  window.addEventListener("hexo-music-wall:navigated", (event) => {
    if (!event.detail?.isMusicPage) bootGlobalPlayer();
  });

  async function bootGlobalPlayer() {
    if (state.root?.isConnected) {
      refreshGlobalPlayerFromSharedAudio();
      state.root.hidden = false;
      if (state.lyricsRoot) state.lyricsRoot.hidden = false;
      syncView();
      return;
    }
    if (state.booting) return;
    state.booting = true;
    try {
      state.data = readJson(STORAGE_NOW_PLAYING, null);
      state.queue = normalizeStoredQueue(readJson(STORAGE_QUEUE, []));
      if (!state.data && !await selectDefaultQueueTrack()) return;

      const adoptedAudio = window.__HEXO_MUSIC_WALL_SHARED_AUDIO__;
      if (adoptedAudio instanceof HTMLMediaElement) {
        state.audio = adoptedAudio;
        state.audioUrl = adoptedAudio.currentSrc || adoptedAudio.src || "";
        state.playing = !adoptedAudio.paused && !adoptedAudio.ended;
        state.mode = state.audioUrl ? "media" : "idle";
        if (state.playing) state.data.isPlaying = true;
        if (Number.isFinite(adoptedAudio.currentTime)) state.data.currentTime = adoptedAudio.currentTime;
      }

      alignCurrentWithQueue();
      // 博客正文页只展示播放器外壳；在访客主动点击播放前不下载整首音频，
      // 避免音乐资源与首屏图片争抢带宽并拖慢 LCP。
      state.audio.preload = "none";
      state.audio.volume = clamp(Number(localStorage.getItem("music-clone:volume") || 0.82), 0, 1);
      state.audio.loop = state.loop;
      createPlayer();
      applySavedPosition();
      bindAudioEvents();
      state.status = state.playing ? "" : (state.data.isPlaying ? "点击播放以继续" : "");
      if (!state.playing) state.data.isPlaying = false;
      syncView();
      requestAnimationFrame(tick);
      hydrateQueue();
      loadLyrics();
      window.addEventListener("resize", clampPlayerPosition);
    } finally {
      state.booting = false;
    }
  }

  async function selectDefaultQueueTrack() {
    if (!state.queue.length) await hydrateQueue();
    const track = state.queue[0];
    if (!track) return false;
    state.data = {
      ...track,
      currentTime: 0,
      duration: Number(track.duration) || SYNTH_DURATION,
      isPlaying: false,
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_NOW_PLAYING, JSON.stringify(state.data));
    return true;
  }

  function refreshGlobalPlayerFromSharedAudio() {
    const previousTrackId = String(state.data?.id || "");
    const nextData = readJson(STORAGE_NOW_PLAYING, null);
    if (nextData) state.data = nextData;
    state.queue = normalizeStoredQueue(readJson(STORAGE_QUEUE, []));

    const adoptedAudio = window.__HEXO_MUSIC_WALL_SHARED_AUDIO__;
    if (adoptedAudio instanceof HTMLMediaElement) state.audio = adoptedAudio;
    const currentUrl = state.audio.currentSrc || state.audio.src || "";
    if (currentUrl) state.audioUrl = currentUrl;
    const mediaPlaying = !state.audio.paused && !state.audio.ended;
    const synthPlaying = state.synth.playing;
    state.playing = mediaPlaying || synthPlaying;
    state.loading = false;
    state.mode = currentUrl ? "media" : (synthPlaying ? "synth" : "idle");
    if (state.data) {
      state.data.isPlaying = state.playing;
      if (mediaPlaying && Number.isFinite(state.audio.currentTime)) state.data.currentTime = state.audio.currentTime;
    }
    alignCurrentWithQueue();
    state.status = state.playing || state.synth.playing ? "" : (state.data?.isPlaying ? "点击播放以继续" : "");
    if (previousTrackId !== String(state.data?.id || "")) loadLyrics();
  }

  function installThemePjaxGuard() {
    if (window.__HEXO_MUSIC_WALL_PJAX_GUARD__) return;
    window.__HEXO_MUSIC_WALL_PJAX_GUARD__ = true;
    window.addEventListener("pjax:send", guardThemePjaxSend, true);
  }

  function guardThemePjaxSend(event) {
    const shared = window.__HEXO_MUSIC_WALL_SHARED_AUDIO__;
    const mediaPlaying = shared instanceof HTMLMediaElement && !shared.paused && !shared.ended;
    const saved = readJson(STORAGE_NOW_PLAYING, null);
    if (!mediaPlaying && !state.loading && !state.synth.playing && !saved?.isPlaying) return;

    window.dispatchEvent(new CustomEvent("hexo-music-wall:navigate-before", {
      detail: { source: "theme-pjax" },
    }));
    // Volantis calls window.stop() in pjax:send, which aborts a streaming audio response.
    event.stopImmediatePropagation();
  }

  window.addEventListener("hexo-music-wall:navigated", (event) => {
    const isMusicPage = Boolean(event.detail?.isMusicPage);
    state.musicPageActive = isMusicPage;
    if (state.root) state.root.hidden = isMusicPage;
    if (state.lyricsRoot) state.lyricsRoot.hidden = isMusicPage;
  });

  window.addEventListener("beforeunload", () => {
    state.data.currentTime = currentPlaybackTime();
    persist(true);
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_FAVORITES) {
      state.favorites = readFavoriteSet();
      syncView();
      return;
    }
    if (event.key === STORAGE_QUEUE) {
      state.queue = normalizeStoredQueue(readJson(STORAGE_QUEUE, []));
      alignCurrentWithQueue();
      syncView();
      return;
    }
    if (event.key !== STORAGE_NOW_PLAYING) return;
    const next = readJson(STORAGE_NOW_PLAYING, null);
    if (!next) {
      stopPlayback();
      state.root?.remove();
      state.lyricsRoot?.remove();
      return;
    }
    stopPlayback();
    state.data = next;
    alignCurrentWithQueue();
    state.audioUrl = "";
    syncAudioSource(true);
    state.status = next.isPlaying ? "点击播放以继续" : "";
    state.data.isPlaying = false;
    loadLyrics();
    syncView();
  });

  function installPersistentNavigation() {
    if (window.__HEXO_MUSIC_WALL_NAVIGATION__ || NAVIGATION_MODE === "native") return;
    window.__HEXO_MUSIC_WALL_NAVIGATION__ = true;
    const pageCache = new Map();
    let navigating = false;
    let activeKey = pageKey(location.href);

    window.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      const link = event.target.closest("a[href]");
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download") || link.getAttribute("rel")?.split(/\s+/).includes("external")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      if (pageKey(url.href) === activeKey || !shouldHandleNavigation(url)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(url, true);
    }, true);

    window.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download") || link.getAttribute("rel")?.split(/\s+/).includes("external")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      if (pageKey(url.href) === activeKey) return;
      if (!shouldHandleNavigation(url)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(url, true);
    }, true);

    window.addEventListener("popstate", (event) => {
      const url = new URL(location.href);
      if (!shouldHandleNavigation(url) && !event.state?.musicWallNavigation) return;
      event.stopImmediatePropagation();
      navigate(url, false);
    }, true);

    async function navigate(url, push) {
      if (navigating) return;
      navigating = true;
      document.documentElement.classList.add("music-wall-navigating");
      window.dispatchEvent(new CustomEvent("hexo-music-wall:navigate-before", { detail: { url: url.href } }));
      try {
        const currentKey = activeKey;
        const nextKey = pageKey(url.href);
        let nextEntry = pageCache.get(nextKey);
        let currentShell;
        let selector;

        if (nextEntry) {
          selector = nextEntry.selector;
          currentShell = findShell(document, selector) || findFirstShell(document)?.element;
        } else {
          const response = await fetch(url.href, { credentials: "same-origin", headers: { "X-Requested-With": "HexoMusicWall" } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const nextDocument = new DOMParser().parseFromString(await response.text(), "text/html");
          const pair = findCompatibleShells(document, nextDocument);
          if (!pair) throw new Error("当前主题缺少可替换的内容容器");
          selector = pair.selector;
          currentShell = pair.current;
          nextEntry = {
            selector,
            shell: document.importNode(pair.next, true),
            title: nextDocument.title,
            bodyClass: nextDocument.body.className,
            bodyTheme: nextDocument.body.dataset.musicWallTheme || "",
            pjaxScripts: collectPjaxScripts(nextDocument, url.href),
          };
        }

        if (!currentShell || !nextEntry?.shell) throw new Error("无法定位主题内容容器");
        pageCache.set(currentKey, {
          selector: selector || selectorForElement(currentShell),
          shell: currentShell,
          title: document.title,
          bodyClass: document.body.className,
          bodyTheme: document.body.dataset.musicWallTheme || "",
          pjaxScripts: collectPjaxScripts(document, location.href),
        });

        currentShell.replaceWith(nextEntry.shell);
        if (nextEntry.title) document.title = nextEntry.title;
        document.body.className = nextEntry.bodyClass || "";
        if (nextEntry.bodyTheme) document.body.dataset.musicWallTheme = nextEntry.bodyTheme;
        else delete document.body.dataset.musicWallTheme;
        if (push) history.pushState({ musicWallNavigation: true }, "", url.href);
        activeKey = nextKey;
        runPjaxScripts(nextEntry.pjaxScripts);
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        const isMusicPage = normalizePath(url.pathname) === MUSIC_PATH;
        document.documentElement.classList.toggle("music-wall-page", isMusicPage);
        document.body.classList.toggle("music-wall-page", isMusicPage);
        if (!isMusicPage) {
          document.documentElement.style.removeProperty("--music-wall-viewport-height");
          document.body.style.background = "";
        }
        if (isMusicPage) await ensureMusicWallAssets();
        runNavigationCompleteHooks(url.href);
        window.dispatchEvent(new CustomEvent("hexo-music-wall:navigated", { detail: { url: url.href, isMusicPage } }));
      } catch (error) {
        console.warn("[hexo-music-wall] 无缝导航失败，已回退到普通跳转。", error);
        location.href = url.href;
      } finally {
        navigating = false;
        document.documentElement.classList.remove("music-wall-navigating");
      }
    }

    function collectPjaxScripts(targetDocument, sourceUrl) {
      return [...targetDocument.querySelectorAll("pjax script")].map((script) => ({
        sourceUrl,
        content: script.textContent || "",
        attributes: [...script.attributes].map((attribute) => [attribute.name, attribute.value]),
      }));
    }

    function runPjaxScripts(scripts) {
      for (const descriptor of scripts || []) {
        const script = document.createElement("script");
        let source = "";
        for (const [name, value] of descriptor.attributes || []) {
          if (name.toLowerCase() === "src") source = value;
          else script.setAttribute(name, value);
        }
        script.dataset.musicWallPjaxScript = "";
        if (source) {
          script.async = false;
          script.src = new URL(source, descriptor.sourceUrl || location.href).href;
          script.addEventListener("load", () => script.remove(), { once: true });
          script.addEventListener("error", () => {
            console.warn(`[hexo-music-wall] 无法执行页面脚本 ${script.src}`);
            script.remove();
          }, { once: true });
          document.head.appendChild(script);
          continue;
        }
        script.textContent = descriptor.content || "";
        document.head.appendChild(script);
        script.remove();
      }
    }

    function runNavigationCompleteHooks(url) {
      const detail = { url, source: "hexo-music-wall" };
      const volantisComplete = window.volantis?.pjax?.method?.complete?.start;
      if (typeof volantisComplete === "function") {
        document.dispatchEvent(new CustomEvent("pjax:success", { detail }));
        volantisComplete.call(window.volantis.pjax.method.complete);
        return;
      }
      document.dispatchEvent(new CustomEvent("pjax:complete", { detail }));
    }

    function shouldHandleNavigation(url) {
      if (NAVIGATION_MODE === "plugin") return true;
      const destinationIsMusic = normalizePath(url.pathname) === MUSIC_PATH;
      const currentIsMusic = normalizePath(location.pathname) === MUSIC_PATH;
      return destinationIsMusic || currentIsMusic || Boolean(state.data || readJson(STORAGE_NOW_PLAYING, null));
    }
  }

  function findCompatibleShells(currentDocument, nextDocument) {
    for (const selector of contentSelectors()) {
      const current = findShell(currentDocument, selector);
      const next = findShell(nextDocument, selector);
      if (current && next) return { selector, current, next };
    }
    return null;
  }

  function findFirstShell(targetDocument) {
    for (const selector of contentSelectors()) {
      const element = findShell(targetDocument, selector);
      if (element) return { selector, element };
    }
    return null;
  }

  function findShell(targetDocument, selector) {
    if (!selector) return null;
    try {
      return targetDocument.querySelector(selector);
    } catch (_) {
      return null;
    }
  }

  function selectorForElement(element) {
    if (element?.id) return `#${CSS.escape(element.id)}`;
    return contentSelectors().find((selector) => findShell(document, selector) === element) || "main";
  }

  function contentSelectors() {
    return [...new Set([
      CONTENT_SELECTOR,
      "#l_main",
      "#main",
      "main#content-inner",
      "#content-inner",
      "main#board",
      "#board",
      ".main-inner",
      "main",
    ].filter(Boolean))];
  }

  async function ensureMusicWallAssets() {
    window.__HEXO_MUSIC_WALL_CONFIG__ = { ...CONFIG };
    ensureStylesheet(`${ASSET_BASE}/styles.css${ASSET_SUFFIX}`);
    if (window.__HEXO_MUSIC_WALL_APP_LOADED__) return;
    await loadScript(`${ASSET_BASE}/app.js${ASSET_SUFFIX}`);
  }

  function ensureStylesheet(href) {
    const target = new URL(href, location.href);
    const exists = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .some((link) => new URL(link.href, location.href).pathname === target.pathname);
    if (exists) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = target.href;
    link.dataset.musicWallStyle = "";
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(src, location.href).href;
      script.dataset.musicWallScript = "";
      script.onload = resolve;
      script.onerror = () => reject(new Error(`无法加载 ${script.src}`));
      document.head.appendChild(script);
    });
  }

  function pageKey(value) {
    const url = new URL(value, location.href);
    return `${normalizePath(url.pathname)}${url.search}`;
  }

  function normalizePath(value) {
    const path = new URL(String(value || "/"), location.origin).pathname.replace(/\/{2,}/g, "/");
    return path === "/" ? "/" : `${path.replace(/\/+$/, "")}/`;
  }

  function createPlayer() {
    const root = document.createElement("aside");
    root.className = `music-wall-floating-player${state.collapsed ? " is-collapsed" : ""}`;
    root.setAttribute("aria-label", "跨页面音乐播放器");
    root.innerHTML = `
      <div class="mw-float-expanded">
        <button class="mw-float-cover-button" type="button" data-action="toggle" aria-label="播放或暂停">
          <span class="mw-float-cover mw-float-cover-large"></span>
          <span class="mw-float-cover-state"></span>
        </button>
        <div class="mw-float-meta">
          <div class="mw-float-title"></div>
          <div class="mw-float-artist"></div>
        </div>
        <div class="mw-float-controls">
          <button class="mw-float-icon" type="button" data-action="prev" aria-label="上一首" title="上一首">${icon("prev")}</button>
          <button class="mw-float-icon mw-float-primary" type="button" data-action="toggle" aria-label="播放或暂停"></button>
          <button class="mw-float-icon" type="button" data-action="next" aria-label="下一首" title="下一首">${icon("next")}</button>
          <button class="mw-float-icon mw-float-loop" type="button" data-action="loop" aria-label="单曲循环" title="单曲循环">${icon("repeat")}</button>
          <button class="mw-float-icon mw-float-lyrics-toggle" type="button" data-action="lyrics" aria-label="歌词显示" title="显示或隐藏歌词">${icon("lyrics")}</button>
          <button class="mw-float-icon mw-float-favorite" type="button" data-action="favorite" aria-label="喜欢" title="喜欢">${icon("heart")}</button>
          <a class="mw-float-icon mw-float-music-wall" href="${MUSIC_PATH}" aria-label="进入音乐墙" title="进入音乐墙">${icon("wall")}</a>
        </div>
        <div class="mw-float-progress-row">
          <span class="mw-float-current">0:00</span>
          <input class="mw-float-progress" type="range" min="0" max="100" step="0.01" value="0" aria-label="播放进度">
          <span class="mw-float-duration">0:00</span>
        </div>
        <div class="mw-float-status" aria-live="polite"></div>
      </div>
      <div class="mw-float-collapsed">
        <button class="mw-float-circle" type="button" data-action="toggle" aria-label="播放或暂停">
          <svg class="mw-float-ring" viewBox="0 0 72 72" aria-hidden="true">
            <circle class="mw-float-ring-bg" cx="36" cy="36" r="32"></circle>
            <circle class="mw-float-ring-fg" cx="36" cy="36" r="32"></circle>
          </svg>
          <span class="mw-float-cover mw-float-cover-small"></span>
          <span class="mw-float-play"></span>
        </button>
      </div>
    `;

    root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action && state.controlPress.action === action && Date.now() - state.controlPress.at < 1000) {
        state.controlPress.action = "";
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (state.drag.suppressClick && !action) {
        state.drag.suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      state.drag.suppressClick = false;
      if (!action) return;
      runPlayerAction(action);
    });

    root.addEventListener("pointerdown", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action || event.button !== 0 || event.isPrimary === false) return;
      state.controlPress = { action, at: Date.now() };
      state.drag.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      runPlayerAction(action);
    }, true);

    const progress = root.querySelector(".mw-float-progress");
    progress.addEventListener("pointerdown", () => { state.seeking = true; });
    progress.addEventListener("input", () => {
      state.seeking = true;
      previewSeek(Number(progress.value));
    });
    progress.addEventListener("change", () => finishSeek(Number(progress.value)));
    progress.addEventListener("pointerup", () => finishSeek(Number(progress.value)));

    root.addEventListener("pointerdown", onDragStart);
    root.addEventListener("pointermove", onDragMove);
    root.addEventListener("pointerup", onDragEnd);
    root.addEventListener("pointercancel", onDragEnd);

    document.body.appendChild(root);
    state.root = root;

    const lyricsRoot = document.createElement("section");
    lyricsRoot.className = "mw-float-lyrics";
    lyricsRoot.setAttribute("aria-label", "桌面歌词");
    lyricsRoot.setAttribute("aria-live", "polite");
    lyricsRoot.innerHTML = `
      <div class="mw-float-lyric-current"></div>
      <div class="mw-float-lyric-next"></div>
    `;
    document.body.appendChild(lyricsRoot);
    state.lyricsRoot = lyricsRoot;
  }

  function runPlayerAction(action) {
    if (action === "toggle") togglePlayback();
    if (action === "prev") playRelative(-1);
    if (action === "next") playRelative(1);
    if (action === "loop") toggleLoop();
    if (action === "lyrics") toggleLyrics();
    if (action === "favorite") toggleFavorite();
  }

  function bindAudioEvents() {
    state.audio.addEventListener("loadedmetadata", () => {
      if (state.mode !== "media") return;
      const duration = finiteMediaDuration();
      if (duration) state.data.duration = duration;
      restoreMediaTime();
      syncView();
    });
    state.audio.addEventListener("loadstart", showMediaBuffering);
    state.audio.addEventListener("waiting", showMediaBuffering);
    state.audio.addEventListener("stalled", showMediaBuffering);
    state.audio.addEventListener("canplay", showMediaReady);
    state.audio.addEventListener("playing", showMediaReady);

    state.audio.addEventListener("play", () => {
      if (state.switching) return;
      state.mode = "media";
      state.loading = false;
      state.playing = true;
      state.data.isPlaying = true;
      state.status = "";
      persist(true);
      syncView();
    });

    state.audio.addEventListener("pause", () => {
      if (state.switching || state.mode !== "media") return;
      state.data.currentTime = state.audio.currentTime || state.data.currentTime || 0;
      state.playing = false;
      state.loading = false;
      state.data.isPlaying = false;
      persist(true);
      syncView();
    });

    state.audio.addEventListener("ended", () => {
      if (state.switching || state.mode !== "media") return;
      if (state.loop) {
        seekTo(0);
        startPlayback(true);
      } else {
        playRelative(1);
      }
    });

    state.audio.addEventListener("error", () => {
      if (!state.loading && state.mode !== "media") return;
      failRemotePlayback("云音频播放失败，请点击播放重试");
    });
  }

  function onDragStart(event) {
    if (event.button !== 0) return;
    const interactive = event.target.closest("input, .mw-float-controls")
      || (!state.collapsed && event.target.closest(".mw-float-cover-button"));
    if (interactive) return;
    if (!state.collapsed && !event.target.closest(".mw-float-meta, .mw-float-expanded")) return;

    const rect = state.root.getBoundingClientRect();
    state.root.style.left = `${rect.left}px`;
    state.root.style.top = `${rect.top}px`;
    state.root.style.transform = "none";
    state.drag.active = true;
    state.drag.pointerId = event.pointerId;
    state.drag.startX = event.clientX;
    state.drag.startY = event.clientY;
    state.drag.originX = rect.left;
    state.drag.originY = rect.top;
    state.drag.moved = false;
    state.root.classList.add("is-dragging");
    try { state.root.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function onDragMove(event) {
    if (!state.drag.active || event.pointerId !== state.drag.pointerId) return;
    const dx = event.clientX - state.drag.startX;
    const dy = event.clientY - state.drag.startY;
    if (!state.drag.moved && Math.hypot(dx, dy) < 4) return;
    state.drag.moved = true;
    const rect = state.root.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);
    const x = clamp(state.drag.originX + dx, 8, maxX);
    const y = clamp(state.drag.originY + dy, 8, maxY);
    state.root.style.left = `${x}px`;
    state.root.style.top = `${y}px`;
    event.preventDefault();
  }

  function onDragEnd(event) {
    if (!state.drag.active || event.pointerId !== state.drag.pointerId) return;
    state.drag.active = false;
    state.drag.pointerId = null;
    state.drag.suppressClick = state.drag.moved;
    state.root.classList.remove("is-dragging");
    if (state.drag.moved) persistPlayerPosition();
    try { state.root.releasePointerCapture(event.pointerId); } catch (_) {}
  }

  function persistPlayerPosition() {
    const rect = state.root.getBoundingClientRect();
    localStorage.setItem(STORAGE_POSITION, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
  }

  function applySavedPosition() {
    const position = readJson(STORAGE_POSITION, null);
    if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) return;
    state.root.style.left = `${Number(position.x)}px`;
    state.root.style.top = `${Number(position.y)}px`;
    state.root.style.transform = "none";
    requestAnimationFrame(clampPlayerPosition);
  }

  function clampPlayerPosition() {
    if (!state.root || state.drag.active || !state.root.style.transform) return;
    const rect = state.root.getBoundingClientRect();
    const x = clamp(rect.left, 8, Math.max(8, window.innerWidth - rect.width - 8));
    const y = clamp(rect.top, 8, Math.max(8, window.innerHeight - rect.height - 8));
    state.root.style.left = `${x}px`;
    state.root.style.top = `${y}px`;
  }

  function togglePlayback() {
    const mediaIsPlaying = state.mode === "media" && !state.audio.paused && !state.audio.ended;
    if (mediaIsPlaying || state.playing || state.loading || state.synth.playing) {
      pausePlayback();
      return;
    }
    primeSynthContext();
    startPlayback(true);
  }

  async function startPlayback(allowFallback) {
    playbackRuntime.hasPlaybackStarted = true;
    const requestId = ++state.requestId;
    dispatchPlaybackCommand("play");
    state.loading = true;
    state.status = state.data.audio && state.data.audioKind !== "synth" ? "正在连接音频..." : "";
    syncView();

    if (!state.data.audio || state.data.audioKind === "synth") {
      startSynth();
      return;
    }

    stopSynth(false);
    state.mode = "media";
    syncAudioSource(false);
    restoreMediaTime();
    try {
      await state.audio.play();
      if (requestId !== state.requestId) state.audio.pause();
    } catch (_) {
      if (requestId !== state.requestId) return;
      if (allowFallback) failRemotePlayback("云音频播放失败，请点击播放重试");
      else {
        state.loading = false;
        state.playing = false;
        state.data.isPlaying = false;
        state.status = "点击播放以继续";
        syncView();
      }
    }
  }

  function pausePlayback() {
    ++state.requestId;
    const current = currentPlaybackTime();
    dispatchPlaybackCommand("pause");
    if (!state.audio.paused) {
      try { state.audio.pause(); } catch (_) {}
    }
    if (state.mode === "synth") stopSynth(true);
    state.data.currentTime = current;
    state.playing = false;
    state.loading = false;
    state.data.isPlaying = false;
    state.status = "";
    persist(true);
    syncView();
  }

  function dispatchPlaybackCommand(action) {
    window.dispatchEvent(new CustomEvent(PLAYBACK_COMMAND_EVENT, {
      detail: { action, source: "floating-player" },
    }));
  }

  function stopPlayback() {
    state.switching = true;
    ++state.requestId;
    try { state.audio.pause(); } catch (_) {}
    stopSynth(false);
    state.playing = false;
    state.loading = false;
    state.mode = "idle";
    state.switching = false;
  }

  function playRelative(offset) {
    if (state.queue.length < 2) {
      state.status = "正在读取歌单...";
      syncView();
      hydrateQueue().then(() => {
        if (state.queue.length > 1) playRelative(offset);
        else {
          state.status = "暂无可切换的歌曲";
          syncView();
        }
      });
      return;
    }

    const currentIndex = findQueueIndex();
    const nextIndex = (Math.max(0, currentIndex) + offset + state.queue.length) % state.queue.length;
    switchTrack(state.queue[nextIndex], true);
  }

  function switchTrack(track, autoplay) {
    stopPlayback();
    state.synth.offset = 0;
    state.synth.clockStartedAt = 0;
    state.data = {
      ...track,
      currentTime: 0,
      duration: Number(track.duration) || SYNTH_DURATION,
      isPlaying: false,
      updatedAt: Date.now(),
    };
    state.audioUrl = "";
    state.status = "";
    loadLyrics();
    syncAudioSource(true);
    persist(true);
    syncView();
    if (autoplay) {
      primeSynthContext();
      startPlayback(true);
    }
  }

  function findQueueIndex() {
    let index = state.queue.findIndex((track) => String(track.id) === String(state.data.id));
    if (index < 0) {
      index = state.queue.findIndex((track) => track.title === state.data.title && track.artist === state.data.artist);
    }
    return index < 0 ? 0 : index;
  }

  function previewSeek(value) {
    const current = getDuration() * clamp(value, 0, 100) / 100;
    state.root.querySelector(".mw-float-current").textContent = formatTime(current);
    setProgressFill(value);
  }

  function finishSeek(value) {
    seekTo(getDuration() * clamp(value, 0, 100) / 100);
    state.seeking = false;
  }

  function seekTo(seconds) {
    const duration = getDuration();
    const current = clamp(Number(seconds) || 0, 0, duration || SYNTH_DURATION);
    state.data.currentTime = current;
    if (state.mode === "media") {
      try { state.audio.currentTime = current; } catch (_) {}
    } else if (state.mode === "synth") {
      state.synth.offset = current;
      if (state.playing) startSynth();
    }
    persist(true);
    syncView();
  }

  function toggleLoop() {
    state.loop = !state.loop;
    state.audio.loop = state.loop;
    localStorage.setItem(STORAGE_LOOP, state.loop ? "1" : "0");
    state.status = state.loop ? "已开启单曲循环" : "已关闭单曲循环";
    syncView();
  }

  function toggleFavorite() {
    const id = String(state.data?.id || "");
    if (!id) return;
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    localStorage.setItem(STORAGE_FAVORITES, JSON.stringify([...state.favorites]));
    state.status = state.favorites.has(id) ? "已收藏" : "已取消收藏";
    syncView();
  }

  function toggleLyrics() {
    state.lyricsEnabled = !state.lyricsEnabled;
    localStorage.setItem(STORAGE_LYRICS, state.lyricsEnabled ? "true" : "false");
    state.status = state.lyricsEnabled ? "已显示歌词" : "已隐藏歌词";
    if (state.lyricsEnabled) loadLyrics();
    syncView();
  }

  function syncAudioSource(force) {
    const url = state.data?.audio || "";
    if (!url || (!force && state.audioUrl === url)) return;
    state.switching = true;
    state.audioUrl = url;
    state.audio.src = url;
    state.audio.load();
    restoreMediaTime();
    state.switching = false;
  }

  function restoreMediaTime() {
    const duration = getDuration() || Number.MAX_SAFE_INTEGER;
    const current = clamp(Number(state.data?.currentTime) || 0, 0, duration);
    try {
      if (Math.abs((state.audio.currentTime || 0) - current) > 0.5) state.audio.currentTime = current;
    } catch (_) {}
  }

  function showMediaBuffering() {
    if (state.mode !== "media" || !state.data?.audio) return;
    state.loading = true;
    state.status = "正在缓存音频...";
    syncView();
  }

  function showMediaReady() {
    if (state.mode !== "media") return;
    state.loading = false;
    state.status = "";
    syncView();
  }

  function failRemotePlayback(message) {
    state.switching = true;
    try { state.audio.pause(); } catch (_) {}
    state.switching = false;
    state.loading = false;
    state.playing = false;
    state.data.isPlaying = false;
    state.data.currentTime = state.audio.currentTime || state.data.currentTime || 0;
    state.status = message;
    persist(true);
    syncView();
  }

  function primeSynthContext() {
    const context = ensureSynthContext();
    if (context?.state === "suspended") context.resume().catch(() => {});
  }

  function ensureSynthContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!state.synth.ctx) {
      const context = new AudioContext();
      const gain = context.createGain();
      gain.gain.value = state.audio.volume * 0.045;
      gain.connect(context.destination);
      state.synth.ctx = context;
      state.synth.gain = gain;
    }
    return state.synth.ctx;
  }

  function startSynth() {
    const context = ensureSynthContext();
    if (!context || !state.synth.gain) {
      state.loading = false;
      state.playing = false;
      state.data.isPlaying = false;
      state.status = "当前浏览器不支持音频播放";
      syncView();
      return;
    }

    stopSynth(false);
    const storedTime = Number(state.data.currentTime);
    const offset = clamp(Number.isFinite(storedTime) ? storedTime : state.synth.offset || 0, 0, getDuration());
    const base = 118 + (Number(state.data.hue) || hashCode(state.data.title || "music")) % 170;
    state.synth.nodes = [1, 1.5, 2].map((multiple, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index % 2 ? "triangle" : "sine";
      oscillator.frequency.value = base * multiple;
      gain.gain.value = 0.22 / (index + 1);
      oscillator.connect(gain);
      gain.connect(state.synth.gain);
      oscillator.start();
      return { oscillator, gain };
    });
    state.synth.offset = offset;
    state.synth.startedAt = context.currentTime - offset;
    state.synth.clockStartedAt = Date.now() - offset * 1000;
    state.synth.playing = true;
    state.mode = "synth";
    state.loading = false;
    state.playing = true;
    state.data.isPlaying = true;
    persist(true);
    syncView();
  }

  function stopSynth(captureTime) {
    if (captureTime && state.synth.playing) state.synth.offset = currentPlaybackTime();
    for (const node of state.synth.nodes) {
      try {
        node.gain.gain.setTargetAtTime(0, state.synth.ctx?.currentTime || 0, 0.02);
        node.oscillator.stop((state.synth.ctx?.currentTime || 0) + 0.05);
      } catch (_) {}
    }
    state.synth.nodes = [];
    state.synth.playing = false;
  }

  function currentPlaybackTime() {
    const duration = getDuration();
    if (state.mode === "media") return clamp(state.audio.currentTime || state.data.currentTime || 0, 0, duration);
    if (state.mode === "synth" && state.synth.playing) {
      return clamp((Date.now() - state.synth.clockStartedAt) / 1000, 0, duration);
    }
    return clamp(Number(state.data.currentTime) || state.synth.offset || 0, 0, duration);
  }

  async function loadLyrics() {
    const trackId = String(state.data?.id || `${state.data?.title || ""}-${state.data?.artist || ""}`);
    if (!state.lyricsEnabled || !trackId) return;
    if (state.lyricsTrackId === trackId && state.lyrics.length) return;
    state.lyricsTrackId = trackId;
    state.lyrics = [];
    syncLyrics(currentPlaybackTime());
    const url = String(state.data?.lyricsUrl || "");
    if (!url) return;
    try {
      const response = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!response.ok || state.lyricsTrackId !== trackId) return;
      const text = await response.text();
      const lines = parseLyrics(text);
      if (state.lyricsTrackId !== trackId) return;
      state.lyrics = lines;
      syncLyrics(currentPlaybackTime());
    } catch (_) {}
  }

  function parseLyrics(value) {
    const lines = [];
    for (const rawLine of String(value || "").split(/\r?\n/)) {
      const matches = [...rawLine.matchAll(/\[(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)\]/g)];
      const text = rawLine.replace(/\[[^\]]+\]/g, "").trim();
      if (!text) continue;
      for (const match of matches) {
        const time = Number(match[1]) * 60 + Number(match[2]);
        if (Number.isFinite(time)) lines.push({ time, text });
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  function syncLyrics(current) {
    if (!state.lyricsRoot) return;
    const panel = state.lyricsRoot;
    const enabled = state.lyricsEnabled && state.lyrics.length > 0;
    panel.classList.toggle("is-visible", enabled);
    if (!enabled) {
      panel.querySelector(".mw-float-lyric-current").textContent = "";
      panel.querySelector(".mw-float-lyric-next").textContent = "";
      return;
    }
    let index = -1;
    for (let cursor = 0; cursor < state.lyrics.length; cursor++) {
      if (state.lyrics[cursor].time <= current + 0.08) index = cursor;
      else break;
    }
    const currentLine = state.lyrics[Math.max(0, index)]?.text || "";
    const nextLine = state.lyrics[Math.max(0, index) + 1]?.text || "";
    panel.querySelector(".mw-float-lyric-current").textContent = currentLine;
    panel.querySelector(".mw-float-lyric-next").textContent = nextLine;
  }

  function syncView() {
    if (!state.root || !state.data) return;
    const title = state.data.title || "网易云音乐";
    const artist = state.data.artist || "未知艺术家";
    const cover = state.data.cover || "";
    const current = currentPlaybackTime();
    const duration = getDuration();
    const progress = duration > 0 ? clamp(current / duration, 0, 1) : 0;
    const active = state.playing || state.loading;
    const dash = 2 * Math.PI * 32;

    state.root.classList.toggle("is-playing", state.playing);
    state.root.classList.toggle("is-loading", state.loading);
    state.root.querySelector(".mw-float-title").textContent = title;
    state.root.querySelector(".mw-float-artist").textContent = artist;
    state.root.querySelector(".mw-float-current").textContent = formatTime(current);
    state.root.querySelector(".mw-float-duration").textContent = formatTime(duration);
    state.root.querySelector(".mw-float-status").textContent = state.status;
    state.root.querySelector(".mw-float-primary").innerHTML = active ? icon("pause") : icon("play");
    state.root.querySelector(".mw-float-primary").setAttribute("aria-label", active ? "暂停" : "播放");
    state.root.querySelector(".mw-float-cover-state").innerHTML = active ? icon("pause") : icon("play");
    state.root.querySelector(".mw-float-play").innerHTML = active ? icon("pause") : icon("play");
    state.root.querySelector(".mw-float-loop").classList.toggle("is-active", state.loop);
    state.root.querySelector(".mw-float-lyrics-toggle").classList.toggle("is-active", state.lyricsEnabled);
    state.root.querySelector(".mw-float-favorite").classList.toggle("is-active", state.favorites.has(String(state.data.id || "")));

    state.root.querySelectorAll(".mw-float-cover").forEach((node) => {
      node.style.backgroundImage = cover ? `url("${cssUrl(cover)}")` : "";
    });

    if (!state.seeking) {
      const range = state.root.querySelector(".mw-float-progress");
      range.value = String(progress * 100);
      range.setAttribute("aria-valuetext", `${formatTime(current)} / ${formatTime(duration)}`);
      setProgressFill(progress * 100);
    }

    const ring = state.root.querySelector(".mw-float-ring-fg");
    ring.style.strokeDasharray = String(dash);
    ring.style.strokeDashoffset = String(dash * (1 - progress));
    state.root.querySelector(".mw-float-circle").style.setProperty("--mw-ring-progress", `${(progress * 100).toFixed(3)}%`);
    syncLyrics(current);
  }

  function setProgressFill(value) {
    state.root.querySelector(".mw-float-progress").style.setProperty("--mw-progress", `${clamp(value, 0, 100)}%`);
  }

  function tick(time = 0) {
    if (time - state.lastTickAt < (state.musicPageActive ? 240 : 34)) {
      requestAnimationFrame(tick);
      return;
    }
    state.lastTickAt = time;
    if (state.root && state.playing && !state.seeking) {
      const current = currentPlaybackTime();
      const duration = getDuration();
      state.data.currentTime = current;
      if (state.mode === "media") state.data.duration = finiteMediaDuration() || state.data.duration;

      if (state.mode === "synth" && current >= duration - 0.03) {
        if (state.loop) seekTo(0);
        else playRelative(1);
      } else {
        persist(false);
        if (!state.musicPageActive) syncView();
      }
    }
    requestAnimationFrame(tick);
  }

  function getDuration() {
    if (state.mode === "media") return finiteMediaDuration() || Number(state.data?.duration) || SYNTH_DURATION;
    return Number(state.data?.duration) || SYNTH_DURATION;
  }

  function finiteMediaDuration() {
    return Number.isFinite(state.audio.duration) && state.audio.duration > 0 ? state.audio.duration : 0;
  }

  function persist(force) {
    if (!state.data) return;
    const time = Date.now();
    if (!force && time - state.lastPersistAt < 1000) return;
    state.lastPersistAt = time;
    state.data.updatedAt = time;
    state.data.isPlaying = state.playing;
    localStorage.setItem(STORAGE_NOW_PLAYING, JSON.stringify(state.data));
  }

  async function hydrateQueue() {
    if (state.queue.length > 1 && state.queue.some((track) => track.lyricsUrl)) {
      alignCurrentWithQueue();
      return state.queue;
    }
    const playlistId = String(CONFIG.playlistId || "");
    if (!playlistId) return state.queue;
    const bases = Array.isArray(CONFIG.apiBases) ? CONFIG.apiBases : [];
    for (const base of bases) {
      try {
        const endpoint = `${trimSlash(base)}?server=netease&type=playlist&id=${encodeURIComponent(playlistId)}`;
        const response = await fetch(endpoint, { mode: "cors", credentials: "omit" });
        if (!response.ok) continue;
        const payload = await response.json();
        const raw = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
        const queue = raw.map(normalizeRemoteQueueTrack).filter(Boolean);
        if (!queue.length) continue;
        state.queue = queue;
        localStorage.setItem(STORAGE_QUEUE, JSON.stringify(queue));
        alignCurrentWithQueue();
        loadLyrics();
        state.status = "";
        // 刷新歌单只更新元数据；已经开始播放时才切换媒体源，防止普通
        // 页面访问因后台歌单水合而触发数 MB 的音频下载。
        if (playbackRuntime.hasPlaybackStarted || state.playing) syncAudioSource(true);
        syncView();
        return queue;
      } catch (_) {}
    }
    return state.queue;
  }

  function normalizeRemoteQueueTrack(item, index) {
    const title = firstText(item?.title, item?.name, item?.songname);
    if (!title) return null;
    const artist = firstText(item?.artist, item?.author, item?.singer) || "未知艺术家";
    const audio = firstText(item?.audio, item?.url, item?.src);
    const cover = firstText(item?.cover, item?.pic, item?.picture);
    const lyricsUrl = firstText(item?.lrc, item?.lyric, item?.lyrics);
    return {
      id: `featured-${item?.id || item?.songmid || item?.mid || index}`,
      title,
      artist,
      cover,
      audio,
      audioKind: audio ? "remote" : "synth",
      duration: parseDuration(item?.duration || item?.interval || item?.time) || SYNTH_DURATION,
      hue: hashCode(`${title}-${artist}-${index}`) % 360,
      lyricsUrl: /^https?:\/\//i.test(lyricsUrl) ? lyricsUrl : "",
      remoteId: String(item?.id || item?.songmid || item?.mid || extractResourceId(audio) || ""),
      audioApiBases: Array.isArray(CONFIG.apiBases) ? CONFIG.apiBases.map(String).filter(Boolean) : [],
    };
  }

  function normalizeStoredQueue(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((track) => track && track.title).map((track, index) => ({
      id: String(track.id || `queue-${index}`),
      title: String(track.title),
      artist: String(track.artist || "未知艺术家"),
      cover: String(track.cover || ""),
      audio: String(track.audio || ""),
      audioKind: String(track.audioKind || (track.audio ? "remote" : "synth")),
      duration: Number(track.duration) || SYNTH_DURATION,
      hue: Number(track.hue) || hashCode(`${track.title}-${track.artist || ""}`) % 360,
      lyricsUrl: String(track.lyricsUrl || ""),
      remoteId: String(track.remoteId || ""),
      audioApiBases: Array.isArray(track.audioApiBases) ? track.audioApiBases.map(String).filter(Boolean) : [],
    }));
  }

  function extractResourceId(value) {
    try {
      return new URL(String(value || ""), location.href).searchParams.get("id") || "";
    } catch (_) {
      return "";
    }
  }

  function alignCurrentWithQueue() {
    if (!state.data || !state.queue.length) return;
    const match = state.queue.find((track) => String(track.id) === String(state.data.id))
      || state.queue.find((track) => track.title === state.data.title && track.artist === state.data.artist);
    if (!match) return;
    state.data = {
      ...match,
      ...state.data,
      audio: match.audio || state.data.audio || "",
      cover: match.cover || state.data.cover || "",
      audioKind: state.data.audioKind || match.audioKind,
      hue: Number(state.data.hue) || match.hue,
      lyricsUrl: match.lyricsUrl || state.data.lyricsUrl || "",
    };
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function readFavoriteSet() {
    const value = readJson(STORAGE_FAVORITES, []);
    return new Set(Array.isArray(value) ? value.map(String) : []);
  }

  function firstText(...values) {
    for (const value of values) {
      if (Array.isArray(value)) {
        const joined = value.map((item) => typeof item === "object" ? item?.name : item).filter(Boolean).join("/");
        if (joined) return joined;
      } else if (value && typeof value === "object" && value.name) {
        return String(value.name);
      } else if (value != null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return "";
  }

  function parseDuration(value) {
    const duration = Number(value);
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return duration > 10000 ? duration / 1000 : duration;
  }

  function trimSlash(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function hashCode(value) {
    let hash = 0;
    for (let index = 0; index < String(value).length; index++) hash = ((hash << 5) - hash + String(value).charCodeAt(index)) | 0;
    return Math.abs(hash);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function icon(type) {
    const icons = {
      play: '<svg class="mw-icon-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7-11-7Z"/></svg>',
      pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
      prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 20 9 12l10-8v16ZM5 19V5"/></svg>',
      next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 4 10 8-10 8V4ZM19 5v14"/></svg>',
      repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
      lyrics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
      heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
      wall: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
    };
    return icons[type] || icons.play;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function cssUrl(url) {
    return String(url).replace(/["\\]/g, "\\$&");
  }
})();
