(() => {
  "use strict";

  if (window.__HEXO_MUSIC_WALL_APP_LOADED__) return;
  window.__HEXO_MUSIC_WALL_APP_LOADED__ = true;

  const STORAGE = {
    favorites: "music-clone:favorites",
    history: "music-clone:history",
    source: "music-clone:source",
    playMode: "music-clone:playMode",
    volume: "music-clone:volume",
    lyrics: "music-clone:lyrics",
    drafts: "music-clone:forumDrafts",
    visual: "music-clone:visualMode",
    desktopLyricsPosition: "music-clone:desktopLyricsPosition:v2",
    nowPlaying: "music-clone:nowPlaying",
    queue: "music-clone:queue",
  };

  const DB_NAME = "music-clone-local";
  const DB_STORE = "tracks";
  const MAX_LOCAL_TRACKS = 50;
  const MAX_FILE_SIZE = 30 * 1024 * 1024;
  const SYNTH_DURATION = 96;
  const MAX_RENDERED_CARDS_DESKTOP = 48;
  const MAX_RENDERED_CARDS_MOBILE = 30;
  const PLAYBACK_UI_INTERVAL = 180;
  const VISUALIZER_INTERVAL = 33;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const now = () => performance.now();
  const CONFIG = normalizeConfig(window.__HEXO_MUSIC_WALL_CONFIG__ || {});
  const playbackRuntime = window.__HEXO_MUSIC_WALL_PLAYBACK_RUNTIME__ || { hasPlaybackStarted: false };
  window.__HEXO_MUSIC_WALL_PLAYBACK_RUNTIME__ = playbackRuntime;

  const refs = {
    app: $("#app"),
    stage: $("#stage"),
    world: $("#world"),
    focusLayer: $("#focusLayer"),
    visualizer: $("#visualizerCanvas"),
    parallax: $("#parallaxLayer"),
    tint: $("#stageTint"),
    status: $("#statusLine"),
    sourceTabsRoot: $(".source-tabs"),
    sourceTabs: $$(".source-tab"),
    miniPlayer: $("#miniPlayer"),
    miniCover: $("#miniCover"),
    miniTitle: $("#miniTitle"),
    miniArtist: $("#miniArtist"),
    miniPlay: $("#miniPlay"),
    miniPrev: $("#miniPrev"),
    miniNext: $("#miniNext"),
    miniProgress: $("#miniProgress"),
    miniProgressFill: $("#miniProgressFill"),
    miniCurrent: $("#miniCurrent"),
    miniDuration: $("#miniDuration"),
    miniMode: $("#miniMode"),
    miniVisual: $("#miniVisual"),
    miniLyrics: $("#miniLyrics"),
    miniLike: $("#miniLike"),
    miniHistory: $("#miniHistory"),
    desktopLyrics: $("#desktopLyrics"),
    desktopLyricCurrent: $("#desktopLyricCurrent"),
    desktopLyricNext: $("#desktopLyricNext"),
    desktopLyricsClose: $("#desktopLyricsClose"),
    volume: $("#volumeSlider"),
    libraryButton: $("#libraryButton"),
    edgeLibraryButton: $("#edgeLibraryButton"),
    historyButton: $("#historyButton"),
    emptyState: $("#emptyState"),
    emptyUploadButton: $("#emptyUploadButton"),
    expandedRoot: $("#expandedRoot"),
    panelRoot: $("#panelRoot"),
    toastRegion: $("#toastRegion"),
  };

  const glyphs = ["♪", "♫", "✦", "◇", "夜", "星", "光", "音", "夢", "雨", "海", "空", "蛍", "月"];
  const titlePartsA = ["星屑", "夜航", "玻璃", "雨后", "青空", "霓虹", "回声", "月光", "糖果", "微光", "水色", "夏末", "云端", "薄荷", "白昼", "深海", "街灯", "花火", "像素", "银河"];
  const titlePartsB = ["通信", "散步", "脉冲", "漂流", "速写", "回廊", "幻象", "练习曲", "序章", "节拍", "观测", "涟漪", "放送", "电台", "航线", "记忆", "花束", "信号", "独白", "终点"];
  const artists = ["Mizuki Lab", "R1ce Garden", "月见电波", "Neko Relay", "雨宫合成器", "Blue Soda", "Rabbit Signal", "浅海工作室", "Hikari Unit", "Pastel Node", "Noriko Loop", "星野驱动", "Mint Circuit", "yuno archive", "白昼频率", "Kumo Quartet"];

  const sampleLyrics = [
    "霓虹在雨里慢慢亮起",
    "把今晚的心跳调成柔软频率",
    "穿过街角那盏蓝色的灯",
    "我们在回声里继续前进",
    "像一封没有寄出的夏日来信",
    "落在玻璃窗上的微光",
    "如果节拍还能再靠近一点",
    "就把沉默也唱成旋律",
  ];

  function normalizeConfig(raw) {
    const apiBases = Array.isArray(raw.apiBases || raw.api_bases)
      ? raw.apiBases || raw.api_bases
      : String(raw.apiBase || raw.api_base || raw.metingApi || raw.meting_api || "").split(",").filter(Boolean);
    const normalizedApiBases = (apiBases.length ? apiBases : [
      "https://api.qijieya.cn/meting/",
      "https://music.3e0.cn/",
      "https://meting.mikus.ink/api",
      "https://met.api.xiaoguan.fit/api",
      "https://meting-api.saop.cc/api",
      "https://met.liiiu.cn/api",
      "https://api.injahow.cn/meting/",
    ]).map((item) => String(item).trim()).filter(Boolean);
    const playlists = normalizePlaylistConfigs(raw);
    const primary = playlists[0] || normalizePlaylistConfig(raw, 0, "featured") || {};
    return {
      title: String(raw.title || "萤火音乐墙"),
      subtitle: String(raw.subtitle || (primary.playlistId ? "来自你的云歌单" : "拖拽探索，点击播放")),
      provider: primary.provider || "netease",
      playlistId: primary.playlistId || "",
      playlistUrl: primary.playlistUrl || "",
      playlists,
      apiBases: normalizedApiBases,
      fallback: raw.fallback !== false,
      fallbackCount: clamp(Number(raw.fallbackCount || raw.fallback_count || 139), 12, 240),
      enableLocalLibrary: raw.enableLocalLibrary === true || raw.enable_local_library === true,
      quality: String(raw.quality || raw.renderQuality || raw.render_quality || "high"),
      storagePrefix: String(raw.storagePrefix || raw.storage_prefix || "music-clone"),
    };
  }

  function normalizePlaylistConfigs(raw) {
    const legacy = normalizePlaylistConfig(raw, 0, "featured");
    return legacy && (legacy.playlistId || legacy.provider === "demo") ? [legacy] : [];
  }

  function normalizePlaylistConfig(raw, index, sourceKey = `playlist-${index}`) {
    if (!raw || typeof raw !== "object") return null;
    const provider = "netease";
    const playlistUrl = String(raw.playlistUrl || raw.playlist_url || raw.url || "");
    const playlistId = String(raw.playlistId || raw.playlist_id || raw.id || extractPlaylistId(playlistUrl, provider) || "");
    const apiBases = Array.isArray(raw.apiBases || raw.api_bases)
      ? raw.apiBases || raw.api_bases
      : String(raw.apiBase || raw.api_base || raw.metingApi || raw.meting_api || "").split(",").filter(Boolean);
    return {
      sourceKey,
      label: String(raw.label || raw.name || raw.title || "网易云"),
      provider,
      playlistId,
      playlistUrl,
      apiBases: apiBases.map((item) => String(item).trim()).filter(Boolean),
    };
  }

  function extractPlaylistId(url, provider) {
    if (!url) return "";
    const text = String(url);
    const patterns = [/playlist\?id=(\d+)/, /id=(\d+)/, /playlist\/(\d+)/];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return "";
  }

  const state = {
    source: readString(STORAGE.source, defaultSource()),
    playMode: readString(STORAGE.playMode, "list"),
    visualMode: normalizeVisualMode(readString(STORAGE.visual, "bars")),
    volume: readNumber(STORAGE.volume, 0.82),
    lyricsEnabled: readString(STORAGE.lyrics, "1") !== "0",
    desktopLyricsPosition: readJson(STORAGE.desktopLyricsPosition, null),
    lyricDrag: { active: false, id: null, dx: 0, dy: 0 },
    favorites: new Set(readJson(STORAGE.favorites, [])),
    history: readJson(STORAGE.history, []),
    drafts: readJson(STORAGE.drafts, []),
    featuredTracks: generateTracks(CONFIG.fallbackCount, "featured"),
    playlistTracks: {},
    localTracks: [],
    tracks: [],
    layout: null,
    instances: [],
    domCards: new Map(),
    size: { w: 0, h: 0 },
    target: { x: 0, y: 0 },
    smooth: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    pointer: { active: false, id: null, x: 0, y: 0, t: 0 },
    miniSeekPointerId: null,
    mouse: { x: 0, y: 0 },
    mouseDirty: true,
    initializedPosition: false,
    currentTrackId: null,
    isPlaying: false,
    currentTime: 0,
    duration: SYNTH_DURATION,
    hasPlaybackStarted: false,
    focusActive: false,
    expandedTrackId: null,
    seekDraft: null,
    raf: 0,
    resizeRaf: 0,
    stageResizeObserver: null,
    renderKey: "",
    lastFrame: now(),
    lastRenderedCount: 0,
    lastPlaybackUiAt: 0,
    lastVisualizerAt: 0,
    visualizerCtx: null,
    visualizerWidth: 0,
    visualizerHeight: 0,
    visualizerValues: new Float32Array(64),
    lastPersistAt: 0,
    playRequestId: 0,
    playbackClockStartedAt: 0,
    playbackClockOffset: 0,
    performanceLite: false,
    pageActive: true,
    mountPresent: true,
  };

  const audio = {
    ctx: null,
    gain: null,
    filter: null,
    analyser: null,
    frequencyData: null,
    osc: [],
    synthStartedAt: 0,
    synthOffset: 0,
    localEl: window.__HEXO_MUSIC_WALL_SHARED_AUDIO__ instanceof HTMLMediaElement
      ? window.__HEXO_MUSIC_WALL_SHARED_AUDIO__
      : new Audio(),
    localUrl: "",
    localTrackId: "",
    remoteController: null,
    remoteMediaSource: null,
    remoteObjectUrl: "",
    pauseRequested: false,
    switching: false,
  };

  refs.volume.value = String(state.volume);
  audio.localEl.preload = "auto";
  audio.localEl.volume = state.volume;
  window.__HEXO_MUSIC_WALL_SHARED_AUDIO__ = audio.localEl;
  window.addEventListener("hexo-music-wall:navigate-before", onMusicWallNavigateBefore);
  window.addEventListener("hexo-music-wall:playback-command", onSharedPlaybackCommand);
  document.addEventListener("pjax:send", onThemePjaxSend);
  document.addEventListener("pjax:complete", onThemePjaxComplete);
  installMountObserver();

  let booted = false;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else queueMicrotask(boot);

  async function boot() {
    if (booted || !refs.app?.isConnected) return;
    booted = true;
    document.body.classList.add("music-wall-page");
    prepareThemeCompatibility();
    applyConfiguredCopy();
    applyVisualMode();
    applyDesktopLyricsPosition();
    bindGlobalEvents();
    installStageResizeObserver();
    window.addEventListener("hexo-music-wall:navigated", onMusicWallNavigated);
    if (CONFIG.enableLocalLibrary) await refreshLocalTracks();
    await refreshFeaturedTracks();
    measure();
    applySource(state.source, { silent: true });
    initializeTrackSelection();
    startFrameLoop();
    updateMiniPlayer();
    updateEmptyState();
    toast(state.featuredFromPlaylist ? "歌单已载入，拖拽卡片开始探索" : "音乐墙已就绪，拖拽卡片开始探索");
  }

  function onMusicWallNavigated(event) {
    if (!booted || !event.detail?.isMusicPage || !refs.app?.isConnected) return;
    activateMusicWall();
  }

  function activateMusicWall() {
    if (!refs.app?.isConnected || (state.pageActive && state.raf)) return;
    state.pageActive = true;
    state.pointer.active = false;
    state.pointer.id = null;
    state.velocity.x = 0;
    state.velocity.y = 0;
    prepareThemeCompatibility();
    syncMusicWallNavOffset();
    measure();
    rebuildLayout();
    centerWorld();
    state.initializedPosition = true;
    initializeTrackSelection();
    state.renderKey = "";
    updateInstances();
    updatePlaybackViews();
    startFrameLoop();
  }

  function onMusicWallNavigateBefore() {
    if (!state.pageActive) return;
    persistNowPlaying(true);
    state.pageActive = false;
    state.pointer.active = false;
    state.pointer.id = null;
    state.velocity.x = 0;
    state.velocity.y = 0;
    refs.stage?.classList.remove("dragging");
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (state.resizeRaf) cancelAnimationFrame(state.resizeRaf);
    state.resizeRaf = 0;
  }

  function onThemePjaxSend() {
    onMusicWallNavigateBefore();
  }

  function onThemePjaxComplete(event) {
    if (event.detail?.source === "hexo-music-wall") return;
    const incomingApp = document.querySelector(".music-wall-embed");
    if (!incomingApp) return;
    if (incomingApp !== refs.app) incomingApp.replaceWith(refs.app);
    onMusicWallNavigated({ detail: { isMusicPage: true } });
  }

  function installMountObserver() {
    let queuedFrame = 0;
    const observer = new MutationObserver(() => {
      if (queuedFrame) return;
      queuedFrame = requestAnimationFrame(() => {
        queuedFrame = 0;
        reconcileMusicWallMount();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function installStageResizeObserver() {
    if (!window.ResizeObserver || state.stageResizeObserver || !refs.stage) return;
    state.stageResizeObserver = new ResizeObserver(() => scheduleStageResize());
    state.stageResizeObserver.observe(refs.stage);
  }

  function scheduleStageResize() {
    if (!state.pageActive || !refs.app?.isConnected || state.resizeRaf) return;
    const nextSize = readStageSize();
    if (!nextSize) return;
    if (Math.abs(nextSize.w - state.size.w) < 2 && Math.abs(nextSize.h - state.size.h) < 2) return;
    state.resizeRaf = requestAnimationFrame(() => {
      state.resizeRaf = 0;
      if (!state.pageActive || !refs.app?.isConnected) return;
      syncMusicWallNavOffset();
      if (!measure()) return;
      rebuildLayout();
      if (state.currentTrackId) focusTrackInWall(state.currentTrackId, { immediate: true, resetTile: true });
      state.renderKey = "";
      updateInstances();
      state.mouseDirty = true;
    });
  }

  function reconcileMusicWallMount() {
    const incomingApp = document.querySelector(".music-wall-embed");
    if (!incomingApp) {
      state.mountPresent = false;
      if (state.pageActive) onMusicWallNavigateBefore();
      return;
    }
    const replaced = incomingApp !== refs.app;
    const needsActivation = !state.mountPresent || replaced || !state.pageActive;
    state.mountPresent = true;
    if (replaced) incomingApp.replaceWith(refs.app);
    if (!booted) return;
    if (!needsActivation) return;
    if (state.pageActive) onMusicWallNavigateBefore();
    activateMusicWall();
  }

  function initializeTrackSelection() {
    if (playbackRuntime.hasPlaybackStarted && restorePlaybackFromSharedState()) {
      focusTrackInWall(state.currentTrackId, { immediate: true, resetTile: true });
      return;
    }
    selectDefaultTrack();
  }

  function selectDefaultTrack() {
    const track = state.tracks[0];
    state.currentTrackId = track?.id || null;
    state.currentTime = 0;
    state.duration = track?.duration || SYNTH_DURATION;
    state.isPlaying = false;
    state.hasPlaybackStarted = false;
    state.focusActive = Boolean(track);
    stopPlaybackClock(0);
    if (track) focusTrackInWall(track.id, { immediate: true, resetTile: true });
  }

  function restorePlaybackFromSharedState() {
    const saved = readJson(STORAGE.nowPlaying, null);
    if (!saved) return false;
    const candidates = [
      ...state.tracks,
      ...Object.values(state.playlistTracks).flat(),
      ...state.localTracks,
      ...state.featuredTracks,
    ];
    const track = candidates.find((item) => String(item.id) === String(saved.id))
      || candidates.find((item) => item.title === saved.title && item.artist === saved.artist);
    if (!track) return false;
    state.currentTrackId = track.id;
    audio.localTrackId = track.id;
    state.currentTime = Number.isFinite(audio.localEl.currentTime)
      ? audio.localEl.currentTime
      : Number(saved.currentTime) || 0;
    state.duration = mediaDuration(track) || Number(saved.duration) || SYNTH_DURATION;
    state.isPlaying = !audio.localEl.paused && !audio.localEl.ended;
    state.hasPlaybackStarted = true;
    state.focusActive = true;
    if (state.isPlaying) startPlaybackClock(state.currentTime);
    else stopPlaybackClock(state.currentTime);
    syncExpandedToTrack(track);
    if (state.lyricsEnabled) ensureTrackLyrics(track);
    return true;
  }

  function startFrameLoop() {
    if (!state.pageActive || state.raf || !refs.app?.isConnected) return;
    state.lastFrame = now();
    state.raf = requestAnimationFrame(frame);
  }

  function onSharedPlaybackCommand(event) {
    if (event.detail?.source !== "floating-player") return;
    if (event.detail.action === "play") {
      audio.pauseRequested = false;
      return;
    }
    if (event.detail.action !== "pause") return;
    audio.pauseRequested = true;
    if (!state.pageActive) return;
    if (!isCurrentMedia()) return;
    state.currentTime = audio.localEl.currentTime || state.currentTime || 0;
    state.isPlaying = false;
    stopPlaybackClock(state.currentTime);
    updatePlaybackViews();
  }

  function prepareThemeCompatibility() {
    document.body.dataset.musicWallTheme = detectTheme();
    document.querySelectorAll(".music-wall-host, .music-wall-page-sibling, .music-wall-page-meta").forEach((node) => {
      node.classList.remove("music-wall-host", "music-wall-page-sibling", "music-wall-page-meta");
    });

    let node = refs.app.parentElement;
    while (node && node !== document.body) {
      node.classList.add("music-wall-host");
      if (node.parentElement !== document.body) {
        for (const sibling of node.parentElement?.children || []) {
          if (sibling === node || sibling.matches("script, style, link, header, nav")) continue;
          sibling.classList.add("music-wall-page-sibling");
        }
      }
      node = node.parentElement;
    }

    document.querySelectorAll(".article-meta, .article-header, .article-footer, .post-meta, .post-header, .post-footer").forEach((meta) => {
      if (meta.closest(".music-wall-host")) meta.classList.add("music-wall-page-meta");
    });
    // Theme site footers sit outside the replaced content shell; hide them on the music page.
    document.querySelectorAll("footer.footer, footer#footer, #footer, .site-footer, #s-top").forEach((meta) => {
      meta.classList.add("music-wall-page-meta");
    });
    syncMusicWallNavOffset();
  }

  function detectTheme() {
    if (document.querySelector("#l_body, #l_main")) return "volantis";
    if (document.querySelector("#page-header, #content-inner") && document.querySelector("#nav")) return "butterfly";
    if (document.querySelector("#header-title") && document.querySelector("#wrap > .outer")) return "landscape";
    if (document.querySelector(".main-inner") && document.querySelector("main#main")) return "next";
    if (document.querySelector("#board") && document.querySelector("#navbar")) return "fluid";
    return "generic";
  }

  function resolveThemeNavElement() {
    const theme = document.body.dataset.musicWallTheme || detectTheme();
    if (theme === "volantis") {
      return document.querySelector("#l_header .l_header, #l_header, .l_header, header");
    }
    if (theme === "butterfly") return document.querySelector("#nav, #page-header");
    if (theme === "landscape") return document.querySelector("#header");
    if (theme === "next") return document.querySelector(".header, #header, header");
    if (theme === "fluid") return document.querySelector("#navbar, .navbar, header");
    return document.querySelector("#l_header, #nav, #header, #navbar, .l_header, header, nav");
  }

  function syncMusicWallNavOffset() {
    const nav = resolveThemeNavElement();
    let offset = 64;
    if (nav) {
      const rect = nav.getBoundingClientRect();
      const styles = window.getComputedStyle(nav);
      const fixedLike = styles.position === "fixed" || styles.position === "sticky";
      if (fixedLike) offset = Math.max(0, Math.round(rect.bottom));
      else offset = Math.max(0, Math.round(rect.height || parseFloat(styles.height) || 64));
    }
    // Avoid a near-zero offset when nav is temporarily transformed off-screen.
    if (offset < 40) offset = 64;
    document.documentElement.style.setProperty("--music-wall-nav-offset", `${offset}px`);
  }

  function applyConfiguredCopy() {
    document.title = CONFIG.title;
    const title = $(".brand-title");
    const subtitle = $(".brand-subtitle");
    if (title) title.textContent = CONFIG.title;
    if (subtitle) subtitle.textContent = CONFIG.subtitle;
    if (refs.status) refs.status.textContent = CONFIG.subtitle;
    configureSourceTabs();
    state.performanceLite = shouldUsePerformanceMode();
    refs.stage.classList.toggle("performance-lite", state.performanceLite);
    if (!CONFIG.enableLocalLibrary) {
      refs.libraryButton?.classList.add("hidden");
      refs.edgeLibraryButton?.classList.add("hidden");
      refs.sourceTabs.forEach((button) => {
        if (button.dataset.source === "mine") button.classList.add("hidden");
      });
    }
  }

  function shouldUsePerformanceMode() {
    const quality = CONFIG.quality.toLowerCase();
    if (["fast", "lite", "low", "performance"].includes(quality)) return true;
    return false;
  }

  function configureSourceTabs() {
    if (!refs.sourceTabsRoot) return;
    const cloudSources = CONFIG.playlists.length
      ? CONFIG.playlists.map((playlist) => ({ source: playlist.sourceKey, label: playlist.label }))
      : [{ source: "featured", label: "推荐" }];
    refs.sourceTabsRoot.innerHTML = "";
    for (const item of cloudSources) {
      refs.sourceTabsRoot.appendChild(createSourceTab(item.label, item.source));
    }
    if (CONFIG.enableLocalLibrary) refs.sourceTabsRoot.appendChild(createSourceTab("我的音乐", "mine"));
    refs.sourceTabs = $$(".source-tab", refs.sourceTabsRoot);
  }

  function createSourceTab(label, source) {
    const button = document.createElement("button");
    button.className = "source-tab";
    button.type = "button";
    button.dataset.source = source;
    button.setAttribute("role", "tab");
    button.textContent = label;
    return button;
  }

  async function refreshFeaturedTracks() {
    state.featuredFromPlaylist = false;
    state.playlistTracks = {};
    if (!CONFIG.playlists.length) return;
    let loaded = 0;
    let fallbackUsed = 0;
    for (const playlist of CONFIG.playlists) {
      refs.status.textContent = playlist.provider === "demo" ? "正在生成推荐歌单..." : `正在读取${playlist.label}...`;
      let tracks = playlist.provider === "demo" ? generateTracks(CONFIG.fallbackCount, playlist.sourceKey, playlist.sourceKey.length) : await loadConfiguredPlaylist(playlist);
      if (tracks.length && playlist.provider !== "demo") loaded++;
      if (!tracks.length && CONFIG.fallback) {
        tracks = generateTracks(CONFIG.fallbackCount, `${playlist.sourceKey}-fallback`, playlist.sourceKey.length);
        fallbackUsed++;
      }
      state.playlistTracks[playlist.sourceKey] = tracks;
    }
    const firstSource = CONFIG.playlists[0]?.sourceKey;
    if (firstSource && state.playlistTracks[firstSource]?.length) {
      state.featuredTracks = state.playlistTracks[firstSource];
    }
    if (loaded) {
      state.featuredFromPlaylist = true;
      refs.status.textContent = `已载入 ${loaded} 个云歌单`;
      return;
    }
    refs.status.textContent = CONFIG.subtitle;
    if (fallbackUsed) toast("歌单接口暂不可用，已使用占位曲目回退");
  }

  function generateTracks(count, prefix = "t", offset = 0) {
    return Array.from({ length: count }, (_, index) => {
      const seedIndex = index + offset * 17;
      const hue = (78 + seedIndex * 17) % 360;
      const span = index < 18 ? (index % 2 ? 2 : 1) : seedIndex % 11 === 0 ? 2 : 1;
      const title = `${titlePartsA[seedIndex % titlePartsA.length]}${titlePartsB[(seedIndex * 7) % titlePartsB.length]}`;
      const suffix = seedIndex % 9 === 0 ? " feat. Lumi" : seedIndex % 13 === 0 ? " (夜间混音)" : seedIndex % 17 === 0 ? " - きらめき" : "";
      return {
        id: `${prefix}-${index}`,
        title: `${title}${suffix}`,
        artist: artists[(seedIndex * 5) % artists.length],
        hue,
        span,
        ratio: 0.96 + ((seedIndex * 37) % 62) / 100,
        coverSeed: (seedIndex * 131 + 17) % 997,
        audioKind: "synth",
        lyrics: buildLyrics(seedIndex),
      };
    });
  }

  async function loadConfiguredPlaylist(playlist) {
    const apiBases = playlist.apiBases.length ? playlist.apiBases : CONFIG.apiBases;
    for (const base of apiBases) {
      try {
        const url = `${trimSlash(base)}?server=${encodeURIComponent(playlist.provider)}&type=playlist&id=${encodeURIComponent(playlist.playlistId)}`;
        const response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!response.ok) continue;
        const payload = await response.json();
        const tracks = normalizePlaylistPayload(payload, playlist);
        if (tracks.length) return tracks;
      } catch (_) {}
    }
    return [];
  }

  function normalizePlaylistPayload(payload, playlist) {
    const rawTracks = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.result)
          ? payload.result
          : Array.isArray(payload?.playlist?.tracks)
            ? payload.playlist.tracks
            : [];
    return rawTracks
      .map((item, index) => normalizeRemoteTrack(item, index, playlist))
      .filter(Boolean)
      .slice(0, 240);
  }

  function normalizeRemoteTrack(item, index, playlist) {
    const title = firstText(item.title, item.name, item.songname, item.songName);
    const artist = firstText(item.artist, item.author, item.singer, item.artists, item.ar);
    const audioUrl = secureRemoteUrl(firstText(item.audio, item.url, item.src));
    const cover = firstText(item.cover, item.pic, item.picture, item.album?.picUrl, item.al?.picUrl);
    const lyricSource = secureRemoteUrl(firstText(item.lrc, item.lyric, item.lyrics));
    const parsedLyrics = parseLyricText(lyricSource);
    const duration = parseDuration(firstText(item.duration, item.interval, item.time, item.dt));
    if (!title) return null;
    const seed = hashCode(`${title}-${artist}-${index}`);
    return {
      id: `${playlist.sourceKey}-${item.id || item.songmid || item.mid || index}`,
      title,
      artist: artist || "未知艺术家",
      cover,
      audio: audioUrl,
      hue: seed % 360,
      span: index < 18 ? (index % 2 ? 2 : 1) : seed % 11 === 0 ? 2 : 1,
      ratio: 0.96 + (seed % 62) / 100,
      coverSeed: seed % 997,
      audioKind: audioUrl ? "remote" : "synth",
      duration: duration || SYNTH_DURATION,
      lyrics: parsedLyrics,
      lyricsUrl: /^https?:\/\//i.test(lyricSource) ? lyricSource : "",
      remoteId: String(item.id || item.songmid || item.mid || extractResourceId(audioUrl) || ""),
      audioApiBases: playlist.apiBases.length ? playlist.apiBases : CONFIG.apiBases,
      lyricsApiBases: playlist.apiBases.length ? playlist.apiBases : CONFIG.apiBases,
    };
  }

  function parseLyricText(value) {
    if (Array.isArray(value)) {
      return value
        .map((line) => ({ time: Number(line?.time), text: String(line?.text || "").trim() }))
        .filter((line) => Number.isFinite(line.time) && line.text)
        .sort((a, b) => a.time - b.time);
    }
    if (!value || /^https?:\/\//i.test(String(value).trim())) return [];
    const lines = [];
    for (const row of String(value).split(/\r?\n/)) {
      const matches = Array.from(row.matchAll(/\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g));
      const text = row.replace(/\[[^\]]+\]/g, "").trim();
      if (!text) continue;
      for (const match of matches) {
        const time = Number(match[1]) * 60 + Number(match[2]);
        if (Number.isFinite(time)) lines.push({ time, text });
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  async function ensureTrackLyrics(track) {
    if (!track || track.lyrics?.length || track._lyricsLoaded || track._lyricsLoading) return;
    track._lyricsLoading = true;
    if (state.expandedTrackId === track.id) updateExpanded();
    const urls = [];
    if (track.lyricsUrl) urls.push(track.lyricsUrl);
    if (track.remoteId) {
      for (const base of track.lyricsApiBases || CONFIG.apiBases) {
        urls.push(`${trimSlash(base)}?server=netease&type=lrc&id=${encodeURIComponent(track.remoteId)}`);
      }
    }
    for (const url of urls) {
      try {
        let response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!response.ok) continue;
        let text = await response.text();
        try {
          const payload = JSON.parse(text);
          text = firstText(payload?.lyric, payload?.lrc, payload?.data?.lyric, payload?.data?.lrc, payload?.data, payload);
        } catch (_) {}
        if (/^https?:\/\//i.test(text) && text !== url) {
          response = await fetch(text, { mode: "cors", credentials: "omit" });
          if (!response.ok) continue;
          text = await response.text();
        }
        const lyrics = parseLyricText(text);
        if (lyrics.length) {
          track.lyrics = lyrics;
          break;
        }
      } catch (_) {}
    }
    track._lyricsLoading = false;
    track._lyricsLoaded = true;
    if (state.expandedTrackId === track.id) updateExpanded();
    if (state.currentTrackId === track.id) updateDesktopLyrics(livePlaybackTime());
  }

  function firstText(...values) {
    for (const value of values) {
      if (Array.isArray(value)) {
        const joined = value.map((item) => firstText(item?.name, item)).filter(Boolean).join("/");
        if (joined) return joined;
      } else if (value && typeof value === "object") {
        const nested = firstText(value.name, value.title);
        if (nested) return nested;
      } else if (value != null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return "";
  }

  function hashCode(input) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index++) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function parseDuration(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "string" && value.includes(":")) {
      const parts = value.split(":").map((item) => Number(item));
      if (parts.some((item) => !Number.isFinite(item))) return 0;
      return parts.reduce((total, item) => total * 60 + item, 0);
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return number > 10000 ? number / 1000 : number;
  }

  function trimSlash(url) {
    return String(url).replace(/\/+$/, "/");
  }

  function secureRemoteUrl(value) {
    const url = String(value || "").trim();
    return url.startsWith("http://") ? `https://${url.slice(7)}` : url;
  }

  function extractResourceId(value) {
    try {
      return new URL(String(value || ""), location.href).searchParams.get("id") || "";
    } catch (_) {
      return "";
    }
  }

  function buildLyrics(seed) {
    return sampleLyrics.map((line, index) => ({
      time: index * 9 + 4 + (seed % 4),
      text: line,
    }));
  }

  function bindGlobalEvents() {
    window.addEventListener("resize", () => {
      if (!state.pageActive) return;
      measure();
      rebuildLayout();
      state.mouseDirty = true;
    });

    refs.stage.addEventListener("pointerdown", onStagePointerDown);
    refs.stage.addEventListener("wheel", onWheel, { passive: false });
    refs.stage.addEventListener("dragstart", (event) => event.preventDefault());
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    refs.sourceTabs.forEach((button) => {
      button.addEventListener("click", () => applySource(button.dataset.source));
    });

    refs.miniPlay?.addEventListener("click", () => togglePlay());
    refs.miniPrev?.addEventListener("click", () => playRelative(-1));
    refs.miniNext?.addEventListener("click", () => playRelative(1));
    refs.miniMode?.addEventListener("click", cyclePlayMode);
    refs.miniVisual?.addEventListener("click", cycleVisualMode);
    refs.miniLyrics?.addEventListener("click", () => setLyricsEnabled(!state.lyricsEnabled));
    refs.desktopLyricsClose?.addEventListener("click", () => setLyricsEnabled(false));
    refs.desktopLyrics?.addEventListener("pointerdown", onDesktopLyricsPointerDown);
    refs.desktopLyrics?.addEventListener("pointermove", onDesktopLyricsPointerMove);
    refs.desktopLyrics?.addEventListener("pointerup", onDesktopLyricsPointerUp);
    refs.desktopLyrics?.addEventListener("pointercancel", onDesktopLyricsPointerUp);
    refs.miniLike?.addEventListener("click", () => {
      if (state.currentTrackId) toggleFavorite(state.currentTrackId);
    });
    refs.miniHistory?.addEventListener("click", () => openHistoryPanel());
    refs.miniProgress?.addEventListener("pointerdown", onMiniProgressPointerDown);
    refs.miniProgress?.addEventListener("pointermove", onMiniProgressPointerMove);
    refs.miniProgress?.addEventListener("pointerup", onMiniProgressPointerUp);
    refs.miniProgress?.addEventListener("pointercancel", onMiniProgressPointerUp);
    refs.miniProgress?.addEventListener("keydown", onMiniProgressKeydown);
    refs.volume?.addEventListener("input", () => setVolume(Number(refs.volume.value)));
    refs.libraryButton?.addEventListener("click", () => openLibraryPanel());
    refs.edgeLibraryButton?.addEventListener("click", () => openLibraryPanel());
    refs.emptyUploadButton?.addEventListener("click", () => openLibraryPanel());
    refs.historyButton?.addEventListener("click", () => openHistoryPanel());

    audio.localEl.addEventListener("timeupdate", () => {
      if (state.pageActive && isCurrentMedia()) {
        state.currentTime = audio.localEl.currentTime || 0;
        state.duration = mediaDuration(findTrack(state.currentTrackId));
        updatePlaybackViews();
      }
    });
    audio.localEl.addEventListener("loadedmetadata", () => {
      if (state.pageActive && isCurrentMedia()) {
        state.duration = mediaDuration(findTrack(state.currentTrackId));
        updatePlaybackViews();
      }
    });
    audio.localEl.addEventListener("loadstart", showRemoteBuffering);
    audio.localEl.addEventListener("waiting", showRemoteBuffering);
    audio.localEl.addEventListener("stalled", showRemoteBuffering);
    audio.localEl.addEventListener("canplay", showRemoteReady);
    audio.localEl.addEventListener("playing", showRemoteReady);
    audio.localEl.addEventListener("play", () => {
      if (!state.pageActive) return;
      if (!isCurrentMedia()) return;
      if (audio.pauseRequested) {
        audio.localEl.pause();
        return;
      }
      state.isPlaying = true;
      updatePlaybackViews();
    });
    audio.localEl.addEventListener("pause", () => {
      if (!state.pageActive) return;
      if (isCurrentMedia() && audio.localEl.paused && (!audio.switching || audio.pauseRequested)) {
        state.isPlaying = false;
        stopPlaybackClock(audio.localEl.currentTime || state.currentTime || 0);
        updatePlaybackViews();
      }
    });
    audio.localEl.addEventListener("ended", () => {
      if (!state.pageActive) return;
      if (isCurrentMedia()) handleEnded();
    });
    audio.localEl.addEventListener("error", () => {
      if (!state.pageActive) return;
      if (isCurrentMedia() && !audio.pauseRequested && !audio.switching) {
        const track = findTrack(state.currentTrackId);
        if (track?.audio && !track.local) failRemotePlayback(track);
        else {
          state.isPlaying = false;
          toast("音频无法播放，已保留视觉播放能力");
          updatePlaybackViews();
        }
      }
    });

    window.addEventListener("keydown", (event) => {
      if (!state.pageActive) return;
      const target = event.target;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        playRelative(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        playRelative(1);
      } else if (event.key === "Escape") {
        closeExpanded();
        closePanel();
      }
    });
    window.addEventListener("beforeunload", () => {
      if (state.pageActive) persistNowPlaying(true);
    });
  }

  function defaultSource() {
    return CONFIG.playlists[0]?.sourceKey || "featured";
  }

  function readStageSize() {
    const rect = refs.stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    const viewportWidth = Math.max(320, window.visualViewport?.width || window.innerWidth || rect.width);
    const viewportHeight = Math.max(320, window.visualViewport?.height || window.innerHeight || rect.height);
    return {
      w: Math.min(rect.width, viewportWidth),
      h: Math.min(rect.height, Math.max(560, viewportHeight)),
    };
  }

  function measure() {
    const nextSize = readStageSize();
    if (!nextSize) return false;
    state.size.w = nextSize.w;
    state.size.h = nextSize.h;
    state.mouse.x = nextSize.w / 2;
    state.mouse.y = nextSize.h / 2;
    resizeVisualizer();
    applyDesktopLyricsPosition();
    return true;
  }

  function applySource(source, options = {}) {
    state.source = resolveSource(source);
    localStorage.setItem(STORAGE.source, state.source);
    state.tracks = tracksForSource(state.source);
    persistPlaybackQueue();
    refs.sourceTabs.forEach((button) => {
      button.classList.toggle("active", button.dataset.source === state.source);
      button.setAttribute("aria-selected", button.dataset.source === state.source ? "true" : "false");
    });
    rebuildLayout();
    updateEmptyState();
    if (!options.silent) toast(`已切换到${sourceLabel(state.source)}`);
  }

  function persistPlaybackQueue() {
    const queue = state.tracks.slice(0, 240).map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist || "未知艺术家",
      cover: track.cover || "",
      audio: track.audio || "",
      audioKind: track.remoteAudioFailed || !track.audio ? "synth" : track.audioKind || "remote",
      duration: track.duration || 0,
      hue: track.hue || 0,
      lyricsUrl: track.lyricsUrl || "",
      remoteId: track.remoteId || extractResourceId(track.audio),
      audioApiBases: track.audioApiBases || CONFIG.apiBases,
    }));
    try {
      localStorage.setItem(STORAGE.queue, JSON.stringify(queue));
    } catch (_) {}
  }

  function resolveSource(source) {
    if (source === "mine" && CONFIG.enableLocalLibrary) return "mine";
    if (source === "featured" && !CONFIG.playlists.length) return "featured";
    if (CONFIG.playlists.some((playlist) => playlist.sourceKey === source)) return source;
    return defaultSource();
  }

  function tracksForSource(source) {
    if (source === "mine") return state.localTracks;
    if (source === "featured") return state.featuredTracks;
    return state.playlistTracks[source] || state.featuredTracks;
  }

  function sourceLabel(source) {
    if (source === "mine") return "我的音乐";
    if (source === "featured") return "推荐音乐";
    return CONFIG.playlists.find((playlist) => playlist.sourceKey === source)?.label || "云歌单";
  }

  function rebuildLayout() {
    state.layout = createLayout(state.tracks, state.size.w < 768 ? 132 : 154, state.size.w < 768 ? 8 : 10, 6);
    state.renderKey = "";
    for (const node of state.domCards.values()) node.remove();
    state.domCards.clear();
    state.instances = [];
    if (!state.layout || !state.size.w || !state.size.h) return;
    if (!state.initializedPosition || Math.abs(state.target.x) > state.layout.tileW * 2 || Math.abs(state.target.y) > state.layout.tileH * 2) {
      centerWorld();
      state.initializedPosition = true;
    }
  }

  function createLayout(tracks, unitWidth, cols, gap) {
    if (!tracks.length) return { cards: [], cols, unitWidth, gap, tileW: cols * unitWidth, tileH: 1 };
    const heights = Array(cols).fill(0);
    const cards = [];
    const scatteredTracks = tracks.slice().sort((a, b) => hashCode(a.id) - hashCode(b.id));
    for (const track of scatteredTracks) {
      const seed = hashCode(track.id);
      const span = Math.min(track.span || 1, cols);
      let col = 0;
      let top = Infinity;
      if (span === 1) {
        heights.forEach((height, index) => {
          if (height < top) {
            top = height;
            col = index;
          }
        });
      } else {
        for (let index = 0; index <= cols - span; index++) {
          const height = Math.max(...heights.slice(index, index + span));
          if (height < top) {
            top = height;
            col = index;
          }
        }
      }
      const width = span * unitWidth - gap;
      const height = Math.round(width * 1.3);
      const y = top;
      const jitterX = (seededUnit(seed, 11) - 0.5) * unitWidth * (span > 1 ? 0.3 : 0.82);
      const jitterY = (seededUnit(seed, 29) - 0.5) * unitWidth * 0.92;
      const worldX = col * unitWidth + jitterX;
      const worldY = Math.max(0, y + jitterY);
      const tilt = (seededUnit(seed, 47) - 0.5) * (span > 1 ? 8 : 14);
      const depthBias = (seededUnit(seed, 71) - 0.5) * 105;
      cards.push({ track, col, span, worldX, worldY, width, height, tilt, depthBias });
      const next = Math.max(y, worldY) + height + gap + seededUnit(seed, 89) * unitWidth * 0.3;
      for (let index = col; index < col + span; index++) heights[index] = next;
    }
    return { cards, cols, unitWidth, gap, tileW: cols * unitWidth, tileH: (Math.max(...heights) || 1) + unitWidth * 0.4 };
  }

  function seededUnit(seed, salt) {
    let value = (seed ^ Math.imul(salt, 0x45d9f3b)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function centerWorld() {
    if (!state.layout) return;
    state.target.x = -state.layout.tileW / 2 + state.size.w / 2;
    state.target.y = -state.layout.tileH / 2 + state.size.h / 2;
    state.smooth.x = state.target.x;
    state.smooth.y = state.target.y;
  }

  function focusTrackInWall(trackId, options = {}) {
    const layout = state.layout;
    if (!layout || !state.size.w || !state.size.h) return;
    const card = layout.cards.find((item) => item.track.id === trackId);
    if (!card) return;
    const centerX = state.size.w / 2;
    const centerY = state.size.h / 2;
    const ix = options.resetTile ? 0 : Math.round((centerX - state.smooth.x - card.worldX - card.width / 2) / layout.tileW);
    const iy = options.resetTile ? 0 : Math.round((centerY - state.smooth.y - card.worldY - card.height / 2) / layout.tileH);
    state.target.x = centerX - (card.worldX + ix * layout.tileW + card.width / 2);
    state.target.y = centerY - (card.worldY + iy * layout.tileH + card.height / 2);
    state.velocity.x = 0;
    state.velocity.y = 0;
    state.initializedPosition = true;
    if (options.immediate) {
      state.smooth.x = state.target.x;
      state.smooth.y = state.target.y;
    }
  }

  function onStagePointerDown(event) {
    if (event.target.closest("button, input, textarea, .modal-root")) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    state.focusActive = false;
    updateCardTransforms();
    refs.stage.classList.add("dragging");
    state.pointer = { active: true, id: event.pointerId, x: event.clientX, y: event.clientY, t: now() };
    state.velocity.x = 0;
    state.velocity.y = 0;
  }

  function onPointerMove(event) {
    if (!state.pageActive) return;
    const rect = refs.stage.getBoundingClientRect();
    state.mouse.x = event.clientX - rect.left;
    state.mouse.y = event.clientY - rect.top;
    state.mouseDirty = true;
    if (!state.pointer.active || state.pointer.id !== event.pointerId) return;
    const dx = event.clientX - state.pointer.x;
    const dy = event.clientY - state.pointer.y;
    const t = now();
    const dt = Math.max(1, t - state.pointer.t);
    state.target.x += dx;
    state.target.y += dy;
    state.velocity.x = (dx / dt) * 16;
    state.velocity.y = (dy / dt) * 16;
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
    state.pointer.t = t;
  }

  function onPointerUp(event) {
    if (!state.pointer.active || state.pointer.id !== event.pointerId) return;
    state.pointer.active = false;
    state.pointer.id = null;
    refs.stage.classList.remove("dragging");
  }

  function onWheel(event) {
    event.preventDefault();
    state.focusActive = false;
    state.target.x -= event.deltaX;
    state.target.y -= event.deltaY;
    state.velocity.x = 0;
    state.velocity.y = 0;
  }

  function frame(time) {
    if (!state.pageActive || !refs.app?.isConnected) {
      state.raf = 0;
      return;
    }
    const dt = Math.min(180, Math.max(0, time - state.lastFrame));
    state.lastFrame = time;
    if (!state.pointer.active) {
      if (Math.abs(state.velocity.x) > 0.04 || Math.abs(state.velocity.y) > 0.04) {
        state.target.x += state.velocity.x;
        state.target.y += state.velocity.y;
        state.velocity.x *= 0.92;
        state.velocity.y *= 0.92;
      }
    }
    const beforeX = state.smooth.x;
    const beforeY = state.smooth.y;
    const focusEase = 1 - Math.exp(-dt / 90);
    state.smooth.x += (state.target.x - state.smooth.x) * focusEase;
    state.smooth.y += (state.target.y - state.smooth.y) * focusEase;
    const moving = state.pointer.active
      || Math.abs(state.velocity.x) > 0.04
      || Math.abs(state.velocity.y) > 0.04
      || Math.abs(state.target.x - state.smooth.x) > 0.08
      || Math.abs(state.target.y - state.smooth.y) > 0.08
      || Math.abs(state.smooth.x - beforeX) > 0.03
      || Math.abs(state.smooth.y - beforeY) > 0.03
      || !state.renderKey;
    if (state.mouseDirty) updateParallax();
    if (moving) updateInstances();
    tickPlayback(time);
    updateSmoothPlaybackProgress();
    updateDesktopLyrics(livePlaybackTime());
    drawAudioVisualizer(time);
    state.raf = requestAnimationFrame(frame);
  }

  function updateParallax() {
    if (!state.size.w || !state.size.h) return;
    state.mouseDirty = false;
    const nx = state.mouse.x / state.size.w * 2 - 1;
    const ny = state.mouse.y / state.size.h * 2 - 1;
    refs.parallax.style.transform = `translate3d(${(-24 * nx).toFixed(2)}px, ${(-24 * ny).toFixed(2)}px, 0)`;
  }

  function resizeVisualizer() {
    if (!refs.visualizer || !state.size.w || !state.size.h) return;
    const maxPixels = state.performanceLite ? 1_350_000 : 2_200_000;
    const areaLimitedDpr = Math.sqrt(maxPixels / Math.max(1, state.size.w * state.size.h));
    const dpr = Math.max(0.65, Math.min(window.devicePixelRatio || 1, 1.35, areaLimitedDpr));
    const width = Math.max(1, Math.round(state.size.w * dpr));
    const height = Math.max(1, Math.round(state.size.h * dpr));
    if (refs.visualizer.width === width && refs.visualizer.height === height && state.visualizerCtx) return;
    refs.visualizer.width = width;
    refs.visualizer.height = height;
    state.visualizerCtx = refs.visualizer.getContext("2d", { alpha: true });
    state.visualizerCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.visualizerWidth = state.size.w;
    state.visualizerHeight = state.size.h;
  }

  function drawAudioVisualizer(time) {
    const ctx = state.visualizerCtx;
    if (!ctx || time - state.lastVisualizerAt < VISUALIZER_INTERVAL) return;
    state.lastVisualizerAt = time;
    const width = state.visualizerWidth;
    const height = state.visualizerHeight;
    ctx.clearRect(0, 0, width, height);
    if (state.visualMode === "off") return;
    const values = sampleVisualizerValues(time);
    const track = findTrack(state.currentTrackId);
    const hue = Number(track?.hue) || 208;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (state.visualMode === "wave") drawWaveVisualizer(ctx, values, width, height, hue, time);
    else if (state.visualMode === "radial") drawRadialVisualizer(ctx, values, width, height, hue);
    else if (state.visualMode === "particles") drawParticleVisualizer(ctx, values, width, height, hue, time);
    else drawBarVisualizer(ctx, values, width, height, hue);
    ctx.restore();
  }

  function sampleVisualizerValues(time) {
    const values = state.visualizerValues;
    if (audio.analyser && audio.osc.length) {
      if (!audio.frequencyData || audio.frequencyData.length !== audio.analyser.frequencyBinCount) {
        audio.frequencyData = new Uint8Array(audio.analyser.frequencyBinCount);
      }
      audio.analyser.getByteFrequencyData(audio.frequencyData);
      const step = audio.frequencyData.length / values.length;
      for (let index = 0; index < values.length; index++) {
        const start = Math.floor(index * step);
        const end = Math.max(start + 1, Math.floor((index + 1) * step));
        let total = 0;
        for (let cursor = start; cursor < end; cursor++) total += audio.frequencyData[cursor] || 0;
        values[index] = total / (end - start) / 255;
      }
      return values;
    }
    const playback = state.isPlaying ? livePlaybackTime() : state.currentTime || time / 1000;
    const energy = state.isPlaying ? 1 : 0.22;
    const beat = Math.pow((Math.sin(playback * 5.2) + 1) / 2, 5) * 0.58;
    for (let index = 0; index < values.length; index++) {
      const band = index / values.length;
      const wave = Math.abs(Math.sin(playback * (2.2 + band * 2.8) + index * 0.47));
      const texture = Math.abs(Math.sin(playback * 0.82 + index * 1.71));
      values[index] = clamp((0.12 + wave * 0.42 + texture * 0.18 + beat * (1 - band * 0.65)) * energy, 0.03, 1);
    }
    return values;
  }

  function drawBarVisualizer(ctx, values, width, height, hue) {
    const count = 36;
    const left = width * 0.055;
    const usable = width * 0.89;
    const gap = Math.max(3, usable / count * 0.28);
    const barWidth = usable / count - gap;
    const centerY = height * 0.51;
    const gradient = ctx.createLinearGradient(0, centerY - height * 0.2, 0, centerY + height * 0.2);
    gradient.addColorStop(0, `hsla(${hue + 54}, 92%, 70%, 0.58)`);
    gradient.addColorStop(0.5, `hsla(${hue}, 92%, 64%, 0.18)`);
    gradient.addColorStop(1, `hsla(${hue - 42}, 92%, 64%, 0.58)`);
    ctx.fillStyle = gradient;
    for (let index = 0; index < count; index++) {
      const value = values[Math.floor(index / count * values.length)];
      const barHeight = 10 + value * height * 0.19;
      const x = left + index * (barWidth + gap);
      ctx.globalAlpha = 0.42 + value * 0.58;
      ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawWaveVisualizer(ctx, values, width, height, hue, time) {
    const centerY = height * 0.5;
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      for (let index = 0; index < values.length; index++) {
        const x = index / (values.length - 1) * width;
        const phase = time / 680 + index * 0.34 + layer * 1.7;
        const y = centerY + Math.sin(phase) * values[index] * height * (0.1 + layer * 0.035);
        if (!index) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${hue + layer * 38}, 92%, ${68 + layer * 5}%, ${0.48 - layer * 0.1})`;
      ctx.lineWidth = 2.4 - layer * 0.45;
      ctx.shadowColor = `hsla(${hue + layer * 38}, 92%, 66%, 0.7)`;
      ctx.shadowBlur = 14;
      ctx.stroke();
    }
  }

  function drawRadialVisualizer(ctx, values, width, height, hue) {
    const centerX = width / 2;
    const centerY = height * 0.49;
    const baseRadius = Math.min(width, height) * 0.215;
    ctx.lineWidth = 2;
    for (let index = 0; index < values.length; index++) {
      const angle = index / values.length * Math.PI * 2 - Math.PI / 2;
      const inner = baseRadius + 5;
      const outer = inner + 14 + values[index] * Math.min(width, height) * 0.105;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
      ctx.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
      ctx.strokeStyle = `hsla(${hue + index * 1.8}, 94%, 70%, ${0.18 + values[index] * 0.55})`;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 94%, 70%, 0.3)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawParticleVisualizer(ctx, values, width, height, hue, time) {
    const seconds = time / 1000;
    ctx.shadowColor = `hsla(${hue}, 94%, 66%, 0.65)`;
    ctx.shadowBlur = 14;
    for (let index = 0; index < 58; index++) {
      const value = values[index % values.length];
      const seedX = seededUnit(index * 7919, 17);
      const seedY = seededUnit(index * 3571, 43);
      const x = (seedX * width + seconds * (8 + seedY * 22)) % (width + 40) - 20;
      const y = seedY * height + Math.sin(seconds * (0.35 + seedX) + index) * 28;
      const radius = 1.2 + value * (2.8 + seedX * 3.2);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue + seedY * 100}, 94%, 72%, ${0.12 + value * 0.55})`;
      ctx.fill();
    }
  }

  function updateInstances() {
    const layout = state.layout;
    if (!layout || !layout.cards.length || !state.size.w || !state.size.h) return;
    const overscan = state.size.w < 768 ? 60 : 100;
    const renderLimit = state.size.w < 768 ? MAX_RENDERED_CARDS_MOBILE : MAX_RENDERED_CARDS_DESKTOP;
    const centerX = state.size.w / 2;
    const centerY = state.size.h / 2;
    const candidates = [];
    for (const card of layout.cards) {
      const baseX = card.worldX + state.smooth.x;
      const baseY = card.worldY + state.smooth.y;
      const minX = Math.floor((-baseX - card.width - overscan) / layout.tileW);
      const maxX = Math.floor((state.size.w - baseX + overscan) / layout.tileW);
      const minY = Math.floor((-baseY - card.height - overscan) / layout.tileH);
      const maxY = Math.floor((state.size.h - baseY + overscan) / layout.tileH);
      for (let ix = minX; ix <= maxX; ix++) {
        for (let iy = minY; iy <= maxY; iy++) {
          candidates.push({
            key: `${card.track.id}_${ix}_${iy}`,
            card,
            x: card.worldX + ix * layout.tileW,
            y: card.worldY + iy * layout.tileH,
            distance: 0,
          });
        }
      }
    }
    let nearestCurrent = null;
    for (const item of candidates) {
      const screenX = item.x + state.smooth.x;
      const screenY = item.y + state.smooth.y;
      const cx = screenX + item.card.width / 2;
      const cy = screenY + item.card.height / 2;
      item.distance = Math.hypot(cx - centerX, cy - centerY);
      if (item.card.track.id === state.currentTrackId && (!nearestCurrent || item.distance < nearestCurrent.distance)) {
        nearestCurrent = item;
      }
    }
    const visible = candidates.length > renderLimit
      ? candidates.sort((a, b) => a.distance - b.distance).slice(0, renderLimit)
      : candidates;
    if (nearestCurrent && !visible.some((item) => item.key === nearestCurrent.key)) {
      if (visible.length >= renderLimit) visible[visible.length - 1] = nearestCurrent;
      else visible.push(nearestCurrent);
    }
    visible.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    const key = visible.map((item) => item.key).join("|");
    if (key !== state.renderKey) {
      const keep = new Set(visible.map((item) => item.key));
      for (const [cardKey, node] of state.domCards.entries()) {
        if (!keep.has(cardKey)) {
          node.remove();
          state.domCards.delete(cardKey);
        }
      }
      const fragment = document.createDocumentFragment();
      for (const item of visible) {
        if (!state.domCards.has(item.key)) {
          const node = createCardNode(item.key, item.card);
          state.domCards.set(item.key, node);
          fragment.appendChild(node);
        }
      }
      if (fragment.childNodes.length) refs.world.appendChild(fragment);
      state.instances = visible;
      state.renderKey = key;
      state.lastRenderedCount = state.domCards.size;
    }
    updateCardTransforms();
  }

  function updateCardTransforms() {
    const centerX = state.size.w / 2;
    const centerY = state.size.h / 2;
    const radius = 0.42 * Math.min(state.size.w, state.size.h);
    const lowMotion = state.performanceLite || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let focusedKey = "";
    let focusedDistance = Infinity;
    for (const item of state.instances) {
      if (item.card.track.id !== state.currentTrackId) continue;
      const cx = item.x + state.smooth.x + item.card.width / 2;
      const cy = item.y + state.smooth.y + item.card.height / 2;
      const distance = Math.hypot(cx - centerX, cy - centerY);
      if (distance < focusedDistance) {
        focusedDistance = distance;
        focusedKey = item.key;
      }
    }
    for (const item of state.instances) {
      const node = state.domCards.get(item.key);
      if (!node) continue;
      const isFocused = state.focusActive && item.key === focusedKey;
      const desiredFocusWidth = state.size.w < 768 ? Math.min(230, state.size.w * 0.62) : Math.min(300, state.size.w * 0.3);
      const renderWidth = isFocused ? desiredFocusWidth : item.card.width;
      const renderHeight = isFocused ? Math.round(renderWidth * 1.3) : item.card.height;
      applyCardDimensions(node, renderWidth, renderHeight);
      if (isFocused && node.parentElement !== refs.focusLayer) refs.focusLayer.appendChild(node);
      if (!isFocused && node.parentElement !== refs.world) refs.world.appendChild(node);
      const x = item.x + state.smooth.x + (item.card.width - renderWidth) / 2;
      const y = item.y + state.smooth.y + (item.card.height - renderHeight) / 2;
      const cx = x + renderWidth / 2;
      const cy = y + renderHeight / 2;
      const distance = Math.hypot(cx - centerX, cy - centerY);
      const glow = Math.exp(-Math.pow(distance / radius, 2));
      if (node.dataset.coverLoaded !== "1" && (glow > 0.035 || item.card.track.id === state.currentTrackId)) revealCoverImage(node);
      const scale = isFocused ? 1 : lowMotion ? 0.74 + 0.2 * glow : 0.45 + 0.55 * glow;
      const z = isFocused ? 0 : lowMotion ? 0 : clamp(-340 + 450 * glow + (item.card.depthBias || 0), -390, 145);
      const rotX = isFocused || lowMotion ? 0 : clamp((cy - centerY) / radius * 44, -46, 46);
      const rotY = isFocused || lowMotion ? 0 : clamp(-(cx - centerX) / radius * 44, -46, 46);
      const rotZ = isFocused || lowMotion ? 0 : item.card.tilt || 0;
      const opacity = isFocused ? 1 : clamp(0.35 + 0.65 * Math.exp(-Math.pow(distance / (2.5 * radius), 2)), 0, 1);
      node.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(1)}px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) rotateZ(${rotZ.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      node.style.opacity = opacity.toFixed(3);
      node.style.zIndex = isFocused ? "999" : "1";
      node.classList.toggle("is-focused", isFocused);
      const visibility = refs.panelRoot.classList.contains("hidden") === false ? "hidden" : "visible";
      if (node.style.visibility !== visibility) node.style.visibility = visibility;
    }
  }

  function applyCardDimensions(node, width, height) {
    const dimensionKey = `${Math.round(width)}x${Math.round(height)}`;
    if (node.dataset.dimensions === dimensionKey) return;
    node.dataset.dimensions = dimensionKey;
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.setProperty("--pad", `${clamp(Math.round(width * 0.055), 8, 14)}px`);
    node.style.setProperty("--cover-radius", `${clamp(Math.round(width * 0.055) + 2, 10, 15)}px`);
    node.style.setProperty("--title-size", `${clamp(Math.round(width * 0.092), 12, 24)}px`);
    node.style.setProperty("--artist-size", `${clamp(Math.round(width * 0.072), 10, 17)}px`);
  }

  function createCardNode(key, card) {
    const { track, width, height } = card;
    const node = document.createElement("article");
    node.className = "music-card";
    node.dataset.key = key;
    applyCardDimensions(node, width, height);
    node.style.setProperty("--hue", track.hue);
    node.style.setProperty("--turn", `${(track.coverSeed % 100) / 100}turn`);
    node.innerHTML = `
      <div class="card-inner">
        ${coverMarkup(track)}
        <div class="card-meta">
          <div class="card-title">${escapeHtml(track.title)}</div>
          <div class="card-artist">${escapeHtml(track.artist || "未知艺术家")}</div>
        </div>
        <div class="card-controls">
          <button type="button" data-action="prev" aria-label="上一首">${icon("prev", clamp(Math.round(width * 0.092), 14, 19))}</button>
          <button class="card-play" type="button" data-action="play" aria-label="播放" style="width:${clamp(Math.round(width * 0.2), 30, 44)}px;height:${clamp(Math.round(width * 0.2), 30, 44)}px">${icon("play", Math.round(clamp(Math.round(width * 0.2), 30, 44) * 0.44))}</button>
          <button type="button" data-action="next" aria-label="下一首">${icon("next", clamp(Math.round(width * 0.092), 14, 19))}</button>
          <button type="button" data-action="like" aria-label="喜欢">${icon("heart", clamp(Math.round(width * 0.092), 14, 19))}</button>
        </div>
      </div>
    `;
    let down = null;
    node.addEventListener("pointerdown", (event) => {
      down = { x: event.clientX, y: event.clientY, t: now() };
    });
    node.addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.action;
      if (action) return;
      if (!down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5 || now() - down.t > 520;
      down = null;
      if (moved) return;
      if (state.currentTrackId !== track.id || !state.isPlaying) playTrack(track.id);
      openExpanded(track);
    });
    node.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      event.stopPropagation();
      const action = button.dataset.action;
      if (action === "play") playTrack(track.id, { toggle: true });
      if (action === "prev") playFromTrack(track.id, -1);
      if (action === "next") playFromTrack(track.id, 1);
      if (action === "like") toggleFavorite(track.id);
    });
    syncCardState(node, track);
    return node;
  }

  function syncAllCardStates() {
    for (const item of state.instances) {
      const node = state.domCards.get(item.key);
      if (node) syncCardState(node, item.card.track);
    }
  }

  function syncCardState(node, track) {
    const isCurrent = state.currentTrackId === track.id;
    const playButton = $('[data-action="play"]', node);
    const likeButton = $('[data-action="like"]', node);
    node.classList.toggle("is-current", isCurrent);
    if (playButton) {
      playButton.innerHTML = state.isPlaying && isCurrent ? icon("pause", 15) : icon("play", 15);
      playButton.setAttribute("aria-label", state.isPlaying && isCurrent ? "暂停" : "播放");
    }
    if (likeButton) likeButton.classList.toggle("liked", state.favorites.has(track.id));
  }

  function coverMarkup(track, className = "", eager = false) {
    const image = track.cover
      ? eager
        ? `<img class="cover-image is-loaded" src="${escapeAttr(track.cover)}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" draggable="false" />`
        : `<img class="cover-image" data-src="${escapeAttr(track.cover)}" alt="" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" draggable="false" />`
      : "";
    return `<div class="cover-art ${track.cover ? "has-image" : ""} ${className}" data-glyph="${escapeHtml(glyphs[track.coverSeed % glyphs.length])}" style="--hue:${track.hue};--turn:${(track.coverSeed % 100) / 100}turn">${image}</div>`;
  }

  function revealCoverImage(root) {
    const image = $(".cover-image[data-src]", root);
    if (!image) {
      root.dataset.coverLoaded = "1";
      return;
    }
    image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
    image.src = image.dataset.src;
    image.removeAttribute("data-src");
    root.dataset.coverLoaded = "1";
    if (image.complete) image.classList.add("is-loaded");
  }

  function playFromTrack(trackId, offset) {
    const index = state.tracks.findIndex((track) => track.id === trackId);
    if (index < 0) return;
    const next = state.tracks[(index + offset + state.tracks.length) % state.tracks.length];
    playTrack(next.id);
  }

  function playRelative(offset) {
    if (!state.tracks.length) return;
    if (!state.currentTrackId) {
      playTrack(state.playMode === "shuffle" ? randomTrackId() : state.tracks[0].id);
      return;
    }
    if (state.playMode === "shuffle") {
      playTrack(randomTrackId(state.currentTrackId));
      return;
    }
    playFromTrack(state.currentTrackId, offset);
  }

  function randomTrackId(excludeId = "") {
    const candidates = state.tracks.filter((track) => track.id !== excludeId);
    const pool = candidates.length ? candidates : state.tracks;
    return pool[Math.floor(Math.random() * pool.length)]?.id || "";
  }

  async function playTrack(trackId, options = {}) {
    const track = findTrack(trackId);
    if (!track) return;
    if (options.toggle && state.currentTrackId === trackId) {
      togglePlay(trackId);
      return;
    }
    const requestId = ++state.playRequestId;
    audio.switching = true;
    audio.pauseRequested = false;
    stopRemoteStream();
    stopSynth();
    pauseLocal(false);
    state.currentTrackId = track.id;
    state.currentTime = 0;
    state.duration = usesMediaElement(track) ? mediaDuration(track) : SYNTH_DURATION;
    state.isPlaying = true;
    state.hasPlaybackStarted = true;
    playbackRuntime.hasPlaybackStarted = true;
    state.focusActive = true;
    startPlaybackClock(0);
    pushHistory(track.id);
    syncExpandedToTrack(track);
    if (state.lyricsEnabled) ensureTrackLyrics(track);
    focusTrackInWall(track.id);
    updateCardTransforms();
    if (track.local) {
      await playLocal(track, requestId);
    } else if (track.audio && !track.remoteAudioFailed) {
      ensureAudioContext();
      await playRemote(track, requestId);
    } else {
      playSynth(track);
    }
    if (requestId !== state.playRequestId) return;
    audio.switching = false;
    refs.status.textContent = `正在播放：${track.title}`;
    updatePlaybackViews();
    persistNowPlaying(true);
  }

  function togglePlay(trackId = state.currentTrackId) {
    if (!trackId) {
      if (state.tracks[0]) playTrack(state.tracks[0].id);
      return;
    }
    const track = findTrack(trackId);
    if (!track) return;
    if (!state.hasPlaybackStarted) {
      playTrack(trackId);
      return;
    }
    if (state.currentTrackId !== trackId) {
      playTrack(trackId);
      return;
    }
    const shouldPause = usesMediaElement(track)
      ? state.isPlaying || (!audio.localEl.paused && !audio.localEl.ended)
      : state.isPlaying;
    if (shouldPause) {
      audio.pauseRequested = true;
      state.currentTime = playbackClockTime(state.duration || SYNTH_DURATION);
      if (usesMediaElement(track)) pauseLocal(true);
      else pauseSynth();
      state.isPlaying = false;
      stopPlaybackClock(state.currentTime);
    } else {
      audio.pauseRequested = false;
      if (usesMediaElement(track)) resumeLocal(track);
      else resumeSynth(track);
      state.isPlaying = true;
      startPlaybackClock(state.currentTime || 0);
    }
    updatePlaybackViews();
    persistNowPlaying(true);
  }

  function playSynth(track) {
    const ctx = ensureAudioContext();
    if (!ctx) {
      state.isPlaying = false;
      toast("当前浏览器不支持 Web Audio，推荐曲目只能浏览");
      return;
    }
    state.duration = SYNTH_DURATION;
    state.currentTime = 0;
    audio.synthOffset = 0;
    startSynth(track, 0);
  }

  function ensureAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!audio.ctx) {
      audio.ctx = new AudioContext();
      audio.gain = audio.ctx.createGain();
      audio.filter = audio.ctx.createBiquadFilter();
      audio.analyser = audio.ctx.createAnalyser();
      audio.filter.type = "lowpass";
      audio.filter.frequency.value = 1400;
      audio.analyser.fftSize = 256;
      audio.analyser.smoothingTimeConstant = 0.78;
      audio.filter.connect(audio.analyser);
      audio.analyser.connect(audio.gain);
      audio.gain.connect(audio.ctx.destination);
      audio.gain.gain.value = state.volume * 0.13;
    }
    if (audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {});
    return audio.ctx;
  }

  function startSynth(track, offset) {
    const ctx = ensureAudioContext();
    if (!ctx || !audio.filter) return;
    stopSynth();
    audio.synthStartedAt = ctx.currentTime - offset;
    audio.synthOffset = offset;
    const base = 130 + (track.hue % 180);
    const intervals = [1, 1.5, 2, 2.5];
    audio.osc = intervals.map((mul, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = index % 2 ? "triangle" : "sine";
      osc.frequency.value = base * mul;
      gain.gain.value = 0.16 / (index + 1);
      osc.connect(gain);
      gain.connect(audio.filter);
      osc.start();
      return { osc, gain };
    });
  }

  function pauseSynth() {
    const ctx = audio.ctx;
    if (ctx) audio.synthOffset = clamp(ctx.currentTime - audio.synthStartedAt, 0, SYNTH_DURATION);
    stopSynth();
  }

  function resumeSynth(track) {
    startSynth(track, audio.synthOffset || state.currentTime || 0);
  }

  function stopSynth() {
    for (const item of audio.osc) {
      try {
        item.gain.gain.setTargetAtTime(0, audio.ctx?.currentTime || 0, 0.02);
        item.osc.stop((audio.ctx?.currentTime || 0) + 0.05);
      } catch (_) {}
    }
    audio.osc = [];
  }

  async function playLocal(track, requestId) {
    try {
      const blob = await getLocalBlob(track.id);
      if (!blob) {
        state.isPlaying = false;
        toast("本地文件已丢失，请重新上传");
        return;
      }
      if (audio.localUrl) URL.revokeObjectURL(audio.localUrl);
      audio.localUrl = URL.createObjectURL(blob);
      audio.localTrackId = track.id;
      audio.localEl.src = audio.localUrl;
      audio.localEl.currentTime = 0;
      audio.localEl.volume = state.volume;
      await audio.localEl.play();
      if (requestId !== state.playRequestId || audio.pauseRequested) audio.localEl.pause();
    } catch (_) {
      if (requestId !== state.playRequestId || audio.pauseRequested) return;
      state.isPlaying = false;
      toast("本地音频播放失败");
    }
  }

  async function playRemote(track, requestId) {
    if (audio.localUrl) {
      URL.revokeObjectURL(audio.localUrl);
      audio.localUrl = "";
    }
    stopRemoteStream();
    audio.localEl.removeAttribute("crossorigin");
    audio.localTrackId = track.id;

    const candidates = remoteAudioCandidates(track);
    for (let index = 0; index < candidates.length; index++) {
      try {
        audio.localEl.src = candidates[index];
        audio.localEl.currentTime = 0;
        audio.localEl.volume = state.volume;
        refs.status.textContent = index
          ? `正在连接备用音源：${track.title}`
          : `正在缓存：${track.title}`;
        await audio.localEl.play();
        if (requestId !== state.playRequestId || audio.pauseRequested) {
          audio.localEl.pause();
          return;
        }
        track.audio = candidates[index];
        return;
      } catch (_) {
        if (requestId !== state.playRequestId || audio.pauseRequested) return;
      }
    }
    failRemotePlayback(track);
  }

  function supportsRemoteStreaming() {
    return typeof MediaSource !== "undefined"
      && typeof ReadableStream !== "undefined"
      && MediaSource.isTypeSupported("audio/mpeg");
  }

  function remoteAudioCandidates(track) {
    const id = track.remoteId || extractResourceId(track.audio);
    const urls = [secureRemoteUrl(track.audio)];
    if (id) {
      for (const base of track.audioApiBases || CONFIG.apiBases) {
        urls.push(`${trimSlash(base)}?server=netease&type=url&id=${encodeURIComponent(id)}`);
      }
    }
    return [...new Set(urls.filter(Boolean))];
  }

  async function playRemoteStream(track, requestId, streamUrl) {
    const mediaSource = new MediaSource();
    const controller = new AbortController();
    const objectUrl = URL.createObjectURL(mediaSource);
    audio.remoteController = controller;
    audio.remoteMediaSource = mediaSource;
    audio.remoteObjectUrl = objectUrl;
    audio.localTrackId = track.id;
    audio.localEl.src = objectUrl;
    audio.localEl.currentTime = 0;
    audio.localEl.volume = state.volume;
    refs.status.textContent = `正在缓存：${track.title}`;

    const sourceOpen = waitForMediaSourceOpen(mediaSource, controller.signal);
    const playPromise = audio.localEl.play().then(() => null, (error) => error);
    const response = await fetch(streamUrl, {
      mode: "cors",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    await sourceOpen;
    if (requestId !== state.playRequestId || controller.signal.aborted) return;

    const mime = normalizeStreamMime(response.headers.get("content-type"));
    const sourceBuffer = mediaSource.addSourceBuffer(mime);
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (requestId !== state.playRequestId || controller.signal.aborted) {
        await reader.cancel();
        return;
      }
      if (value?.byteLength) await appendStreamChunk(sourceBuffer, value, controller.signal);
    }
    if (mediaSource.readyState === "open" && !sourceBuffer.updating) mediaSource.endOfStream();
    const playError = await playPromise;
    if (playError) throw playError;
  }

  function waitForMediaSourceOpen(mediaSource, signal) {
    if (mediaSource.readyState === "open") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        mediaSource.removeEventListener("sourceopen", onOpen);
        signal.removeEventListener("abort", onAbort);
      };
      const onOpen = () => { cleanup(); resolve(); };
      const onAbort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
      mediaSource.addEventListener("sourceopen", onOpen, { once: true });
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function appendStreamChunk(sourceBuffer, chunk, signal) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        sourceBuffer.removeEventListener("updateend", onDone);
        sourceBuffer.removeEventListener("error", onError);
        signal.removeEventListener("abort", onAbort);
      };
      const onDone = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error("音频流解析失败")); };
      const onAbort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
      sourceBuffer.addEventListener("updateend", onDone, { once: true });
      sourceBuffer.addEventListener("error", onError, { once: true });
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        sourceBuffer.appendBuffer(chunk);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  function normalizeStreamMime(contentType) {
    const type = String(contentType || "").split(";")[0].trim().toLowerCase();
    return MediaSource.isTypeSupported(type) ? type : "audio/mpeg";
  }

  function stopRemoteStream() {
    if (audio.remoteController) audio.remoteController.abort();
    audio.remoteController = null;
    audio.remoteMediaSource = null;
    if (audio.remoteObjectUrl) URL.revokeObjectURL(audio.remoteObjectUrl);
    audio.remoteObjectUrl = "";
  }

  function pauseLocal(update = true) {
    refs.miniPlayer?.classList.remove("is-buffering");
    audio.localEl.pause();
    if (update && isCurrentMedia()) state.currentTime = audio.localEl.currentTime || 0;
  }

  function resumeLocal(track) {
    audio.pauseRequested = false;
    audio.localEl.play().catch(() => {
      if (track?.audio && !track.local) failRemotePlayback(track);
      else {
        state.isPlaying = false;
        toast("音频播放失败");
        updatePlaybackViews();
      }
    });
  }

  function usesMediaElement(track) {
    return Boolean(track?.local || (track?.audio && !track.remoteAudioFailed));
  }

  function mediaDuration(track) {
    const elementDuration = Number.isFinite(audio.localEl.duration) && audio.localEl.duration > 0 ? audio.localEl.duration : 0;
    return elementDuration || track?.duration || SYNTH_DURATION;
  }

  function showRemoteBuffering() {
    if (!state.pageActive) return;
    if (!isCurrentMedia() || audio.pauseRequested) return;
    const track = findTrack(state.currentTrackId);
    refs.miniPlayer?.classList.add("is-buffering");
    refs.status.textContent = `正在缓存：${track?.title || "云音乐"}`;
    updatePlaybackViews();
  }

  function showRemoteReady() {
    if (!state.pageActive) return;
    if (!isCurrentMedia() || audio.pauseRequested) return;
    const track = findTrack(state.currentTrackId);
    refs.miniPlayer?.classList.remove("is-buffering");
    refs.status.textContent = `正在播放：${track?.title || "云音乐"}`;
    updatePlaybackViews();
  }

  function failRemotePlayback(track, message = "云音频播放失败，请点击播放重试") {
    if (!track || track.local) return;
    refs.miniPlayer?.classList.remove("is-buffering");
    state.currentTime = audio.localEl.currentTime || state.currentTime || 0;
    state.duration = mediaDuration(track);
    audio.pauseRequested = true;
    audio.localEl.pause();
    state.isPlaying = false;
    audio.switching = false;
    stopPlaybackClock(state.currentTime);
    refs.status.textContent = message;
    toast(message);
    updatePlaybackViews();
    persistNowPlaying(true);
  }

  function isCurrentMedia() {
    return state.currentTrackId && audio.localTrackId === state.currentTrackId;
  }

  function seekTo(seconds, options = {}) {
    const track = findTrack(state.currentTrackId);
    if (!track) return;
    const duration = state.duration || SYNTH_DURATION;
    const nextTime = clamp(seconds, 0, duration);
    state.currentTime = nextTime;
    if (state.isPlaying) startPlaybackClock(nextTime);
    else stopPlaybackClock(nextTime);
    if (usesMediaElement(track)) {
      audio.localEl.currentTime = nextTime;
    } else {
      audio.synthOffset = nextTime;
      if (state.isPlaying) startSynth(track, nextTime);
    }
    updatePlaybackViews();
    if (options.persist !== false) persistNowPlaying(true);
  }

  function onMiniProgressPointerDown(event) {
    if (!canSeekMiniProgress()) return;
    event.preventDefault();
    event.stopPropagation();
    state.miniSeekPointerId = event.pointerId;
    refs.miniProgress.classList.add("is-dragging");
    try { refs.miniProgress.setPointerCapture(event.pointerId); } catch (_) {}
    seekFromMiniProgress(event, { persist: true });
  }

  function onMiniProgressPointerMove(event) {
    if (state.miniSeekPointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    seekFromMiniProgress(event, { persist: false });
  }

  function onMiniProgressPointerUp(event) {
    if (state.miniSeekPointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    seekFromMiniProgress(event, { persist: true });
    state.miniSeekPointerId = null;
    refs.miniProgress.classList.remove("is-dragging");
    try { refs.miniProgress.releasePointerCapture(event.pointerId); } catch (_) {}
  }

  function onMiniProgressKeydown(event) {
    if (!canSeekMiniProgress()) return;
    const duration = state.duration || SYNTH_DURATION;
    const step = event.shiftKey ? 15 : 5;
    const current = state.currentTime || 0;
    let nextTime = null;
    if (event.key === "ArrowLeft") nextTime = current - step;
    if (event.key === "ArrowRight") nextTime = current + step;
    if (event.key === "Home") nextTime = 0;
    if (event.key === "End") nextTime = duration;
    if (nextTime == null) return;
    event.preventDefault();
    seekTo(nextTime);
  }

  function canSeekMiniProgress() {
    return Boolean(refs.miniProgress && state.currentTrackId && state.duration);
  }

  function seekFromMiniProgress(event, options = {}) {
    if (!state.currentTrackId || !state.duration) return;
    const rect = refs.miniProgress.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    seekTo(state.duration * ratio, options);
  }

  function handleEnded() {
    if (state.playMode === "one") {
      seekTo(0);
      togglePlay(state.currentTrackId);
    } else if (state.playMode === "once") {
      state.isPlaying = false;
      state.currentTime = 0;
      updatePlaybackViews();
    } else {
      playRelative(1);
    }
  }

  function tickPlayback(time) {
    const track = findTrack(state.currentTrackId);
    if (!track || !state.isPlaying) return;
    if (usesMediaElement(track)) {
      if (time - state.lastPlaybackUiAt > PLAYBACK_UI_INTERVAL) {
        state.lastPlaybackUiAt = time;
        state.duration = mediaDuration(track);
        state.currentTime = Math.max(audio.localEl.currentTime || 0, playbackClockTime(state.duration), state.currentTime || 0);
        updatePlaybackViews();
      }
      return;
    }
    if (audio.ctx) {
      state.currentTime = Math.max(clamp(audio.ctx.currentTime - audio.synthStartedAt, 0, SYNTH_DURATION), playbackClockTime(SYNTH_DURATION));
      if (state.currentTime >= SYNTH_DURATION - 0.05) handleEnded();
      else if (time - state.lastPlaybackUiAt > PLAYBACK_UI_INTERVAL) {
        state.lastPlaybackUiAt = time;
        updatePlaybackViews();
      }
    }
  }

  function livePlaybackTime() {
    const track = findTrack(state.currentTrackId);
    const duration = state.duration || SYNTH_DURATION;
    if (!track || !state.isPlaying) return clamp(state.currentTime || 0, 0, duration);
    if (usesMediaElement(track)) {
      return clamp(Math.max(audio.localEl.currentTime || 0, playbackClockTime(duration)), 0, duration);
    }
    if (audio.ctx && audio.synthStartedAt) {
      return clamp(Math.max(audio.ctx.currentTime - audio.synthStartedAt, playbackClockTime(duration)), 0, duration);
    }
    return playbackClockTime(duration);
  }

  function updateSmoothPlaybackProgress() {
    if (!refs.miniProgressFill || state.miniSeekPointerId != null) return;
    const duration = state.duration || 0;
    const current = duration ? livePlaybackTime() : 0;
    const progress = duration > 0 ? clamp(current / duration, 0, 1) : 0;
    refs.miniProgressFill.style.width = `${(progress * 100).toFixed(3)}%`;
    if (refs.miniCurrent) {
      const label = formatTime(current);
      if (refs.miniCurrent.textContent !== label) refs.miniCurrent.textContent = label;
    }
  }

  function setVolume(value) {
    state.volume = clamp(value, 0, 1);
    localStorage.setItem(STORAGE.volume, String(state.volume));
    audio.localEl.volume = state.volume;
    if (audio.gain) audio.gain.gain.value = state.volume * 0.13;
  }

  function startPlaybackClock(offset = state.currentTime || 0) {
    state.playbackClockOffset = Math.max(0, Number(offset) || 0);
    state.playbackClockStartedAt = now();
  }

  function stopPlaybackClock(offset = state.currentTime || 0) {
    state.playbackClockOffset = Math.max(0, Number(offset) || 0);
    state.playbackClockStartedAt = 0;
  }

  function playbackClockTime(duration = SYNTH_DURATION) {
    if (!state.playbackClockStartedAt) return clamp(state.playbackClockOffset || 0, 0, duration || SYNTH_DURATION);
    return clamp((state.playbackClockOffset || 0) + (now() - state.playbackClockStartedAt) / 1000, 0, duration || SYNTH_DURATION);
  }

  function updatePlaybackViews() {
    updateMiniPlayer();
    updateDesktopLyrics(livePlaybackTime());
    updateExpanded();
    syncAllCardStates();
    updateStageAudioTint();
    persistNowPlaying(false);
  }

  function persistNowPlaying(force) {
    if (!state.hasPlaybackStarted) return;
    const track = findTrack(state.currentTrackId);
    if (!track) return;
    const time = now();
    if (!force && time - state.lastPersistAt < 1000) return;
    state.lastPersistAt = time;
    const payload = {
      id: track.id,
      title: track.title,
      artist: track.artist || "未知艺术家",
      cover: track.cover || "",
      audio: track.audio || "",
      audioKind: track.remoteAudioFailed || !track.audio ? "synth" : track.audioKind || "remote",
      hue: track.hue || 0,
      lyricsUrl: track.lyricsUrl || "",
      remoteId: track.remoteId || extractResourceId(track.audio),
      audioApiBases: track.audioApiBases || CONFIG.apiBases,
      currentTime: state.currentTime || 0,
      duration: state.duration || SYNTH_DURATION,
      isPlaying: state.isPlaying,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE.nowPlaying, JSON.stringify(payload));
    } catch (_) {}
  }

  function updateMiniPlayer() {
    const track = findTrack(state.currentTrackId);
    const duration = state.duration || 0;
    const progress = duration > 0 ? clamp((state.currentTime || 0) / duration, 0, 1) : 0;
    const current = clamp(state.currentTime || 0, 0, duration || SYNTH_DURATION);
    refs.miniPlayer?.classList.toggle("is-empty", !track || !state.hasPlaybackStarted);
    refs.miniTitle.textContent = track ? track.title : "还没有播放";
    refs.miniArtist.textContent = track ? track.artist || "未知艺术家" : "选择一张音乐卡片";
    refs.miniCover.style.setProperty("--mini-hue", track ? track.hue : 120);
    refs.miniCover.innerHTML = track?.cover ? `<img src="${escapeAttr(track.cover)}" alt="" referrerpolicy="no-referrer" />` : "";
    refs.miniPlay.innerHTML = state.isPlaying ? icon("pause", 20) : icon("play", 20);
    refs.miniPlay.setAttribute("aria-label", state.isPlaying ? "暂停" : "播放");
    refs.miniPlay.setAttribute("title", state.isPlaying ? "暂停" : "播放");
    refs.miniPlay.dataset.tooltip = state.isPlaying ? "暂停" : "播放";
    if (refs.miniProgressFill) refs.miniProgressFill.style.width = `${(progress * 100).toFixed(2)}%`;
    if (refs.miniCurrent) refs.miniCurrent.textContent = formatTime(current);
    if (refs.miniDuration) refs.miniDuration.textContent = formatTime(duration);
    refs.miniMode?.classList.toggle("active", state.playMode !== "list");
    setButtonIcon(refs.miniMode, state.playMode === "shuffle" ? "shuffle" : state.playMode === "one" ? "repeatOne" : state.playMode === "once" ? "stop" : "repeat");
    refs.miniMode?.setAttribute("title", `播放模式：${modeLabel(state.playMode)}`);
    if (refs.miniMode) refs.miniMode.dataset.tooltip = `播放模式：${modeLabel(state.playMode)}`;
    refs.miniVisual?.classList.toggle("active", state.visualMode !== "off");
    setButtonIcon(refs.miniVisual, ({ bars: "visualBars", wave: "visualWave", radial: "visualRadial", particles: "visualParticles" })[state.visualMode] || "visualOff");
    refs.miniVisual?.setAttribute("title", `视觉效果：${visualLabel(state.visualMode)}`);
    if (refs.miniVisual) refs.miniVisual.dataset.tooltip = `视觉效果：${visualLabel(state.visualMode)}`;
    refs.miniLyrics?.classList.toggle("active", state.lyricsEnabled);
    setButtonIcon(refs.miniLyrics, "mic");
    refs.miniLyrics?.setAttribute("title", state.lyricsEnabled ? "关闭桌面歌词" : "开启桌面歌词");
    if (refs.miniLyrics) refs.miniLyrics.dataset.tooltip = state.lyricsEnabled ? "关闭桌面歌词" : "开启桌面歌词";
    refs.miniLike?.classList.toggle("liked", Boolean(track && state.favorites.has(track.id)));
    if (refs.miniLike) {
      const likeLabel = track && state.favorites.has(track.id) ? "取消收藏" : "收藏当前歌曲";
      refs.miniLike.setAttribute("title", likeLabel);
      refs.miniLike.dataset.tooltip = likeLabel;
    }
    if (refs.miniProgress) {
      refs.miniProgress.setAttribute("aria-valuemax", String(Math.round(duration || SYNTH_DURATION)));
      refs.miniProgress.setAttribute("aria-valuenow", String(Math.round(current)));
      refs.miniProgress.setAttribute("aria-valuetext", `${formatTime(current)} / ${formatTime(duration)}`);
    }
  }

  function updateStageAudioTint() {
    const intensity = state.isPlaying ? 0.18 + Math.sin((state.currentTime || 0) * 2.4) * 0.04 : 0.22;
    refs.tint.style.opacity = String(clamp(intensity + (1 - state.volume) * 0.16, 0.18, 0.42));
  }

  function findTrack(trackId) {
    if (!trackId) return null;
    const playlistTrack = Object.values(state.playlistTracks)
      .flat()
      .find((track) => track.id === trackId);
    return state.tracks.find((track) => track.id === trackId)
      || playlistTrack
      || state.localTracks.find((track) => track.id === trackId)
      || state.featuredTracks.find((track) => track.id === trackId)
      || null;
  }

  function toggleFavorite(trackId) {
    if (!trackId) return;
    if (state.favorites.has(trackId)) state.favorites.delete(trackId);
    else state.favorites.add(trackId);
    localStorage.setItem(STORAGE.favorites, JSON.stringify([...state.favorites]));
    syncAllCardStates();
    updateExpanded();
    updateMiniPlayer();
  }

  function pushHistory(trackId) {
    const track = findTrack(trackId);
    const entry = {
      trackId,
      playedAt: Date.now(),
      title: track?.title || "",
      artist: track?.artist || "",
      cover: track?.cover || "",
      hue: track?.hue || 210,
      coverSeed: track?.coverSeed || 0,
    };
    state.history = [entry, ...state.history.filter((item) => item.trackId !== trackId)].slice(0, 50);
    localStorage.setItem(STORAGE.history, JSON.stringify(state.history));
  }

  function setPlayMode(mode) {
    state.playMode = ["list", "one", "shuffle", "once"].includes(mode) ? mode : "list";
    localStorage.setItem(STORAGE.playMode, state.playMode);
    toast(`播放模式：${modeLabel(state.playMode)}`);
    updateExpanded();
    updateMiniPlayer();
  }

  function cyclePlayMode() {
    const modes = ["list", "one", "shuffle", "once"];
    const index = modes.indexOf(state.playMode);
    setPlayMode(modes[(index + 1) % modes.length]);
  }

  function setVisualMode(mode) {
    state.visualMode = normalizeVisualMode(mode);
    localStorage.setItem(STORAGE.visual, state.visualMode);
    applyVisualMode();
    toast(`视觉效果：${visualLabel(state.visualMode)}`);
    updateExpanded();
    updateMiniPlayer();
  }

  function applyVisualMode() {
    if (refs.stage) refs.stage.dataset.visual = state.visualMode;
    state.lastVisualizerAt = 0;
    resizeVisualizer();
    if (state.visualMode === "off" && state.visualizerCtx) {
      state.visualizerCtx.clearRect(0, 0, state.visualizerWidth, state.visualizerHeight);
    }
  }

  function cycleVisualMode() {
    const modes = ["bars", "wave", "radial", "particles", "off"];
    const index = modes.indexOf(state.visualMode);
    setVisualMode(modes[(index + 1) % modes.length]);
  }

  function normalizeVisualMode(mode) {
    if (mode === "rain") return "bars";
    if (mode === "center") return "radial";
    return ["bars", "wave", "radial", "particles", "off"].includes(mode) ? mode : "bars";
  }

  function setLyricsEnabled(enabled) {
    state.lyricsEnabled = enabled;
    localStorage.setItem(STORAGE.lyrics, enabled ? "1" : "0");
    const currentTrack = findTrack(state.currentTrackId);
    if (enabled) {
      ensureTrackLyrics(currentTrack || findTrack(state.expandedTrackId));
      updateDesktopLyrics(livePlaybackTime());
    } else {
      refs.desktopLyrics?.classList.add("hidden");
    }
    toast(enabled ? "桌面歌词已开启" : "桌面歌词已关闭");
    updateExpanded();
    updateMiniPlayer();
  }

  function updateDesktopLyrics(currentTime = state.currentTime || 0) {
    const root = refs.desktopLyrics;
    if (!root) return;
    const track = findTrack(state.currentTrackId);
    if (!state.lyricsEnabled || !track || !state.hasPlaybackStarted) {
      root.classList.add("hidden");
      return;
    }
    root.classList.remove("hidden");
    if (track._lyricsLoading) {
      renderDesktopLyricStatus(track.id, "loading", "正在加载歌词...");
      return;
    }
    const lines = track.lyrics || [];
    if (!lines.length) {
      renderDesktopLyricStatus(track.id, "empty", "暂无歌词");
      return;
    }
    const index = lyricIndexAt(lines, currentTime + 0.08);
    const current = lines[index] || lines[0];
    const next = lines[index + 1] || null;
    const endTime = next?.time > current.time ? next.time : current.time + 4.5;
    const ratio = clamp((currentTime - current.time) / Math.max(0.5, endTime - current.time), 0, 1);
    const renderKey = `${track.id}:${index}:${current.text}`;
    if (root.dataset.renderKey !== renderKey) {
      root.dataset.renderKey = renderKey;
      refs.desktopLyricCurrent.innerHTML = `
        <span class="desktop-lyric-base">${escapeHtml(current.text)}</span>
        <span class="desktop-lyric-fill" aria-hidden="true"><span>${escapeHtml(current.text)}</span></span>
      `;
      refs.desktopLyricNext.textContent = next?.text || "";
    }
    refs.desktopLyricCurrent.style.setProperty("--lyric-progress", `${(ratio * 100).toFixed(2)}%`);
  }

  function renderDesktopLyricStatus(trackId, status, text) {
    const key = `${trackId}:${status}`;
    if (refs.desktopLyrics.dataset.renderKey === key) return;
    refs.desktopLyrics.dataset.renderKey = key;
    refs.desktopLyricCurrent.innerHTML = `<span class="desktop-lyric-base">${escapeHtml(text)}</span>`;
    refs.desktopLyricNext.textContent = "";
    refs.desktopLyricCurrent.style.setProperty("--lyric-progress", "0%");
  }

  function lyricIndexAt(lines, time) {
    let low = 0;
    let high = lines.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (lines[middle].time <= time) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  function applyDesktopLyricsPosition() {
    const root = refs.desktopLyrics;
    const position = state.desktopLyricsPosition;
    if (!root || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    const width = root.offsetWidth || Math.min(820, Math.max(280, state.size.w - 48));
    const height = root.offsetHeight || 82;
    root.style.left = `${clamp(position.x, 0, Math.max(0, state.size.w - width))}px`;
    root.style.top = `${clamp(position.y, 0, Math.max(0, state.size.h - height))}px`;
    root.style.bottom = "auto";
    root.style.transform = "none";
  }

  function onDesktopLyricsPointerDown(event) {
    if (event.target.closest("button")) return;
    const appRect = refs.stage.getBoundingClientRect();
    const rect = refs.desktopLyrics.getBoundingClientRect();
    state.lyricDrag = {
      active: true,
      id: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
    };
    refs.desktopLyrics.classList.add("is-dragging");
    refs.desktopLyrics.style.left = `${rect.left - appRect.left}px`;
    refs.desktopLyrics.style.top = `${rect.top - appRect.top}px`;
    refs.desktopLyrics.style.bottom = "auto";
    refs.desktopLyrics.style.transform = "none";
    try { refs.desktopLyrics.setPointerCapture(event.pointerId); } catch (_) {}
    event.preventDefault();
  }

  function onDesktopLyricsPointerMove(event) {
    if (!state.lyricDrag.active || state.lyricDrag.id !== event.pointerId) return;
    const appRect = refs.stage.getBoundingClientRect();
    const width = refs.desktopLyrics.offsetWidth;
    const height = refs.desktopLyrics.offsetHeight;
    const x = clamp(event.clientX - appRect.left - state.lyricDrag.dx, 0, Math.max(0, appRect.width - width));
    const y = clamp(event.clientY - appRect.top - state.lyricDrag.dy, 0, Math.max(0, appRect.height - height));
    refs.desktopLyrics.style.left = `${x}px`;
    refs.desktopLyrics.style.top = `${y}px`;
  }

  function onDesktopLyricsPointerUp(event) {
    if (!state.lyricDrag.active || state.lyricDrag.id !== event.pointerId) return;
    state.lyricDrag.active = false;
    state.lyricDrag.id = null;
    refs.desktopLyrics.classList.remove("is-dragging");
    state.desktopLyricsPosition = {
      x: Number.parseFloat(refs.desktopLyrics.style.left) || 0,
      y: Number.parseFloat(refs.desktopLyrics.style.top) || 0,
    };
    localStorage.setItem(STORAGE.desktopLyricsPosition, JSON.stringify(state.desktopLyricsPosition));
    try { refs.desktopLyrics.releasePointerCapture(event.pointerId); } catch (_) {}
  }

  function openExpanded(track) {
    state.expandedTrackId = track.id;
    refs.miniPlayer?.classList.add("is-modal-layer");
    refs.expandedRoot.classList.remove("hidden");
    refs.expandedRoot.setAttribute("aria-hidden", "false");
    renderExpanded(track);
    ensureTrackLyrics(track);
    updateCardTransforms();
  }

  function syncExpandedToTrack(track) {
    if (!track || !state.expandedTrackId || refs.expandedRoot.classList.contains("hidden")) return;
    if (state.expandedTrackId === track.id) return;
    state.expandedTrackId = track.id;
    renderExpanded(track);
  }

  function closeExpanded() {
    state.expandedTrackId = null;
    refs.miniPlayer?.classList.remove("is-modal-layer");
    refs.expandedRoot.classList.add("hidden");
    refs.expandedRoot.setAttribute("aria-hidden", "true");
    refs.expandedRoot.innerHTML = "";
    updateCardTransforms();
  }

  function renderExpanded(track) {
    const isCurrent = state.currentTrackId === track.id;
    const playing = isCurrent && state.isPlaying;
    const duration = isCurrent ? state.duration : SYNTH_DURATION;
    const current = isCurrent ? state.currentTime : 0;
    refs.expandedRoot.innerHTML = `
      <div class="modal-backdrop" data-close="expanded"></div>
      <div class="expanded-wrap">
        <article class="expanded-card" style="--active-hue:${track.hue}">
          <button class="icon-button expanded-close" type="button" data-close="expanded" aria-label="关闭" title="关闭">${icon("close", 19)}</button>
          <div class="expanded-visual">
            <svg class="progress-ring" id="progressRing" viewBox="0 0 236 236" aria-label="播放进度">
              <circle class="progress-bg" cx="118" cy="118" r="106"></circle>
              <circle class="progress-fg" id="progressCircle" cx="118" cy="118" r="106"></circle>
            </svg>
            <div class="expanded-cover ${playing ? "playing" : ""}">
              ${coverMarkup(track, "", true)}
            </div>
          </div>
          <div class="expanded-info">
            <div class="expanded-head">
              <div class="expanded-copy">
                <div class="expanded-title">${escapeHtml(track.title)}</div>
                <div class="expanded-artist">${escapeHtml(track.artist || "未知艺术家")}</div>
              </div>
            </div>
            <div class="expanded-lyrics" id="expandedLyrics" aria-live="polite"></div>
            <div class="time-row">
              <span id="expandedCurrent">${formatTime(current)}</span>
              <span>/</span>
              <span id="expandedDuration">${formatTime(duration)}</span>
            </div>
            <div class="expanded-controls">
              <div class="expanded-control-side">
                <button class="icon-button ${state.favorites.has(track.id) ? "liked" : ""}" type="button" data-action="like" aria-label="喜欢" title="收藏">${icon("heart", 18)}</button>
              </div>
              <div class="transport">
                <button class="icon-button" type="button" data-action="prev" aria-label="上一首" title="上一首">${icon("prev", 18)}</button>
                <button class="play-button" type="button" data-action="toggle" aria-label="${playing ? "暂停" : "播放"}" title="播放 / 暂停">${playing ? icon("pause", 22) : icon("play", 22)}</button>
                <button class="icon-button" type="button" data-action="next" aria-label="下一首" title="下一首">${icon("next", 18)}</button>
              </div>
              <div class="expanded-control-side">
                <button class="icon-button ${state.lyricsEnabled ? "active" : ""}" type="button" data-action="lyrics" aria-label="歌词" title="${state.lyricsEnabled ? "关闭歌词" : "开启歌词"}">${icon("mic", 18)}</button>
              </div>
            </div>
          </div>
        </article>
      </div>
    `;
    refs.expandedRoot.onclick = onExpandedClick;
    bindProgressRing();
    updateExpanded();
    updateCardTransforms();
  }

  function onExpandedClick(event) {
    const close = event.target.closest("[data-close='expanded']");
    if (close) {
      closeExpanded();
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    const track = findTrack(state.expandedTrackId);
    if (!track) return;
    if (action === "toggle") playTrack(track.id, { toggle: true });
    if (action === "prev") playFromTrack(track.id, -1);
    if (action === "next") playFromTrack(track.id, 1);
    if (action === "like") toggleFavorite(track.id);
    if (action === "lyrics") setLyricsEnabled(!state.lyricsEnabled);
    if (action === "share") openShareModal(track);
  }

  function bindProgressRing() {
    const ring = $("#progressRing", refs.expandedRoot);
    if (!ring) return;
    const pointerToTime = (event) => {
      const rect = ring.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);
      const angle = (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      return angle / (Math.PI * 2) * (state.duration || SYNTH_DURATION);
    };
    ring.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      ring.setPointerCapture(event.pointerId);
      state.seekDraft = pointerToTime(event);
      updateExpanded();
    });
    ring.addEventListener("pointermove", (event) => {
      if (state.seekDraft == null) return;
      state.seekDraft = pointerToTime(event);
      updateExpanded();
    });
    const finish = (event) => {
      if (state.seekDraft == null) return;
      seekTo(state.seekDraft);
      state.seekDraft = null;
      try { ring.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    ring.addEventListener("pointerup", finish);
    ring.addEventListener("pointercancel", finish);
  }

  function updateExpanded() {
    if (refs.expandedRoot.classList.contains("hidden")) return;
    const track = findTrack(state.expandedTrackId);
    if (!track) return;
    const isCurrent = state.currentTrackId === track.id;
    const playing = isCurrent && state.isPlaying;
    const duration = isCurrent ? state.duration || SYNTH_DURATION : SYNTH_DURATION;
    const current = state.seekDraft != null ? state.seekDraft : isCurrent ? state.currentTime : 0;
    const ratio = duration ? clamp(current / duration, 0, 1) : 0;
    const circle = $("#progressCircle", refs.expandedRoot);
    if (circle) {
      const circumference = 2 * Math.PI * 106;
      circle.style.strokeDasharray = `${circumference}`;
      circle.style.strokeDashoffset = `${circumference * (1 - ratio)}`;
    }
    const cover = $(".expanded-cover", refs.expandedRoot);
    if (cover) cover.classList.toggle("playing", playing);
    const currentEl = $("#expandedCurrent", refs.expandedRoot);
    const durationEl = $("#expandedDuration", refs.expandedRoot);
    if (currentEl) currentEl.textContent = formatTime(current);
    if (durationEl) durationEl.textContent = formatTime(duration);
    const toggle = $('[data-action="toggle"]', refs.expandedRoot);
    if (toggle) {
      toggle.innerHTML = playing ? icon("pause", 22) : icon("play", 22);
      toggle.setAttribute("aria-label", playing ? "暂停" : "播放");
    }
    const like = $('[data-action="like"]', refs.expandedRoot);
    if (like) like.classList.toggle("liked", state.favorites.has(track.id));
    const lyricsToggle = $('[data-action="lyrics"]', refs.expandedRoot);
    if (lyricsToggle) {
      lyricsToggle.classList.toggle("active", state.lyricsEnabled);
      lyricsToggle.setAttribute("title", state.lyricsEnabled ? "关闭歌词" : "开启歌词");
    }
    renderLyrics(track, current);
  }

  function renderLyrics(track, currentTime) {
    const root = $("#expandedLyrics", refs.expandedRoot);
    if (!root) return;
    if (!state.lyricsEnabled) {
      if (root.dataset.renderKey === "disabled") return;
      root.dataset.renderKey = "disabled";
      root.innerHTML = `<div class="expanded-lyric-status">歌词已关闭</div>`;
      return;
    }
    if (track._lyricsLoading) {
      if (root.dataset.renderKey === "loading") return;
      root.dataset.renderKey = "loading";
      root.innerHTML = `<div class="expanded-lyric-status">正在加载歌词...</div>`;
      return;
    }
    const lines = track.lyrics || [];
    if (!lines.length) {
      if (root.dataset.renderKey === "empty") return;
      root.dataset.renderKey = "empty";
      root.innerHTML = `<div class="expanded-lyric-status">暂无歌词</div>`;
      return;
    }
    let index = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime + 0.2) index = i;
    }
    const current = lines[index]?.text || lines[0]?.text || "";
    const previous = index > 0 ? lines[index - 1]?.text || "" : "";
    const next = lines[Math.min(lines.length - 1, index + 1)]?.text || "";
    const renderKey = `line-${index}-${current}`;
    if (root.dataset.renderKey === renderKey) return;
    root.dataset.renderKey = renderKey;
    root.innerHTML = `
      <div class="expanded-lyric-context expanded-lyric-previous">${escapeHtml(previous || " ")}</div>
      <div class="expanded-lyric-current">${escapeHtml(current)}</div>
      <div class="expanded-lyric-context expanded-lyric-next">${escapeHtml(next || " ")}</div>
    `;
  }

  function openLibraryPanel() {
    renderPanel("library");
  }

  function openHistoryPanel() {
    renderPanel("history");
  }

  function closePanel() {
    refs.panelRoot.classList.add("hidden");
    refs.panelRoot.setAttribute("aria-hidden", "true");
    refs.panelRoot.innerHTML = "";
    updateCardTransforms();
  }

  function renderPanel(type) {
    refs.panelRoot.classList.remove("hidden");
    refs.panelRoot.setAttribute("aria-hidden", "false");
    refs.panelRoot.innerHTML = `
      <div class="modal-backdrop" data-close="panel"></div>
      <div class="panel-wrap">
        <aside class="panel" role="dialog" aria-modal="true">
          <div class="panel-header">
            <div>
              <div class="panel-title">${type === "library" ? "我的音乐" : "播放历史"}</div>
              <div class="panel-subtitle">${type === "library" ? "本地保存，刷新后仍可使用" : "最近 50 首播放记录"}</div>
            </div>
            <button class="icon-button panel-close" type="button" data-close="panel" aria-label="关闭" title="关闭">${icon("close", 17)}</button>
          </div>
          <div class="panel-body">${type === "library" ? libraryMarkup() : historyMarkup()}</div>
        </aside>
      </div>
    `;
    refs.panelRoot.onclick = onPanelClick;
    const fileInput = $("#audioUpload", refs.panelRoot);
    if (fileInput) fileInput.addEventListener("change", onUploadFiles);
    bindListCoverImages();
    updateCardTransforms();
  }

  function onPanelClick(event) {
    if (event.target.closest("[data-close='panel']")) {
      closePanel();
      return;
    }
    const actionNode = event.target.closest("[data-panel-action]");
    if (!actionNode) return;
    const action = actionNode.dataset.panelAction;
    const trackId = actionNode.dataset.trackId;
    if (action === "play") playTrack(trackId);
    if (action === "delete") deleteLocalTrack(trackId);
    if (action === "clear-local") clearLocalTracks();
    if (action === "clear-history") clearHistory();
    if (action === "mode") setPlayMode(actionNode.dataset.mode);
    if (action === "visual") setVisualMode(actionNode.dataset.mode);
  }

  function libraryMarkup() {
    return `
      <div class="upload-zone">
        <strong>上传本地音频</strong>
        <input id="audioUpload" type="file" accept="audio/*" multiple />
        <div class="panel-subtitle">最多 ${MAX_LOCAL_TRACKS} 首，单文件不超过 30MB。</div>
      </div>
      <div class="panel-actions">
        ${modeButton("list")}
        ${modeButton("one")}
        ${modeButton("shuffle")}
        ${modeButton("once")}
      </div>
      <div class="panel-actions">
        ${visualButton("bars")}
        ${visualButton("wave")}
        ${visualButton("radial")}
        ${visualButton("particles")}
        ${visualButton("off")}
      </div>
      <div class="panel-actions">
        <button class="danger-button" type="button" data-panel-action="clear-local">清空本地曲库</button>
      </div>
      <div class="list">
        ${state.localTracks.length ? state.localTracks.map(localTrackItem).join("") : `<div class="empty-copy">还没有本地音乐。你可以先上传音频，或者切回推荐源体验合成曲目。</div>`}
      </div>
    `;
  }

  function historyMarkup() {
    const items = state.history
      .map((item) => ({ item, track: findTrack(item.trackId) || historyEntryTrack(item) }))
      .filter((entry) => entry.track);
    return `
      <div class="panel-actions">
        <button class="danger-button" type="button" data-panel-action="clear-history">清空历史</button>
      </div>
      <div class="list">
        ${items.length ? items.map(({ item, track }) => listTrackItem(track, new Date(item.playedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))).join("") : `<div class="empty-copy">还没有播放历史。</div>`}
      </div>
    `;
  }

  function localTrackItem(track) {
    return `
      <div class="list-item">
        ${listCoverMarkup(track)}
        <div class="list-meta">
          <div class="list-title">${escapeHtml(track.title)}</div>
          <div class="list-subtitle">${escapeHtml(track.artist || "本地音乐")} · ${formatBytes(track.size || 0)}</div>
        </div>
        <button class="icon-button" type="button" data-panel-action="play" data-track-id="${escapeAttr(track.id)}" aria-label="播放">${icon("play", 17)}</button>
        <button class="icon-button" type="button" data-panel-action="delete" data-track-id="${escapeAttr(track.id)}" aria-label="删除">${icon("trash", 17)}</button>
      </div>
    `;
  }

  function listTrackItem(track, subtitle) {
    return `
      <div class="list-item">
        ${listCoverMarkup(track)}
        <div class="list-meta">
          <div class="list-title">${escapeHtml(track.title)}</div>
          <div class="list-subtitle">${escapeHtml(subtitle || track.artist || "未知艺术家")}</div>
        </div>
        <button class="icon-button" type="button" data-panel-action="play" data-track-id="${escapeAttr(track.id)}" aria-label="播放">${icon("play", 17)}</button>
      </div>
    `;
  }

  function historyEntryTrack(item) {
    if (!item?.title) return null;
    return {
      id: item.trackId,
      title: item.title,
      artist: item.artist || "未知艺术家",
      cover: item.cover || "",
      hue: Number(item.hue) || 210,
      coverSeed: Number(item.coverSeed) || 0,
    };
  }

  function listCoverMarkup(track) {
    const fallbackTrack = { ...track, cover: "" };
    const image = track.cover
      ? `<img class="list-cover-image" src="${escapeAttr(track.cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
      : "";
    return `<div class="list-cover" style="background:${coverBackground(fallbackTrack)}">${image}</div>`;
  }

  function bindListCoverImages() {
    $$(".list-cover-image", refs.panelRoot).forEach((image) => {
      image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
      image.addEventListener("error", () => image.remove(), { once: true });
      if (image.complete && image.naturalWidth) image.classList.add("is-loaded");
    });
  }

  function modeButton(mode) {
    return `<button class="${state.playMode === mode ? "primary-button" : "ghost-button"}" type="button" data-panel-action="mode" data-mode="${mode}">${modeLabel(mode)}</button>`;
  }

  function visualButton(mode) {
    return `<button class="${state.visualMode === mode ? "primary-button" : "ghost-button"}" type="button" data-panel-action="visual" data-mode="${mode}">${visualLabel(mode)}</button>`;
  }

  async function onUploadFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (!window.indexedDB) {
      toast("当前浏览器不支持 IndexedDB，无法保存本地曲库");
      return;
    }
    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith("audio/")) {
        toast(`${file.name} 不是音频文件`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast(`${file.name} 超过 30MB`);
        continue;
      }
      if (state.localTracks.length + added >= MAX_LOCAL_TRACKS) {
        toast("本地曲库已达到 50 首上限");
        break;
      }
      const title = file.name.replace(/\.[^.]+$/, "") || "未命名音频";
      const seed = Math.floor(Math.random() * 9999);
      const record = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title,
        artist: "本地上传",
        blob: file,
        mime: file.type || "audio/*",
        size: file.size,
        hue: seed % 360,
        span: seed % 7 === 0 ? 2 : 1,
        ratio: 1,
        coverSeed: seed,
        sortIndex: state.localTracks.length + added,
        addedAt: Date.now(),
        local: true,
        audioKind: "local",
        lyrics: buildLyrics(seed),
      };
      await putLocalTrack(record);
      added++;
    }
    await refreshLocalTracks();
    applySource("mine", { silent: true });
    renderPanel("library");
    toast(`已添加 ${added} 首本地音乐`);
  }

  function openShareModal(track) {
    const dataUrl = generatePoster(track);
    refs.panelRoot.classList.remove("hidden");
    refs.panelRoot.setAttribute("aria-hidden", "false");
    refs.panelRoot.innerHTML = `
      <div class="modal-backdrop" data-close="share"></div>
      <section class="share-card" role="dialog" aria-modal="true">
        <div class="share-tabs">
          <button class="share-tab active" type="button" data-share-tab="poster">分享海报</button>
          <button class="share-tab" type="button" data-share-tab="forum">发到论坛</button>
        </div>
        <div class="share-body" id="sharePoster">
          <div class="poster-preview"><img src="${dataUrl}" alt="分享海报" /></div>
          <div class="share-actions">
            <a class="primary-button" download="${safeFilename(track.title)}.jpg" href="${dataUrl}">保存图片</a>
            <button class="ghost-button" type="button" data-share-action="copy">复制链接</button>
          </div>
        </div>
        <div class="share-body hidden" id="shareForum">
          <div class="list-item">
            <div class="list-cover" style="background:${coverBackground(track)}"></div>
            <div class="list-meta">
              <div class="list-title">${escapeHtml(track.title)}</div>
              <div class="list-subtitle">${escapeHtml(track.artist || "未知艺术家")}</div>
            </div>
          </div>
          <textarea class="draft-box" id="forumDraft" maxlength="500" placeholder="说点什么...">${escapeHtml(`正在听《${track.title}》，这张卡片太适合夜晚了。`)}</textarea>
          <div class="category-row">
            ${["综合", "生活", "游戏", "代码", "求助"].map((item, index) => `<button class="category ${index === 0 ? "active" : ""}" type="button" data-category="${item}">${item}</button>`).join("")}
          </div>
          <button class="primary-button" type="button" data-share-action="draft">保存到本地草稿</button>
        </div>
      </section>
    `;
    refs.panelRoot.addEventListener("click", (event) => onShareClick(event, track), { once: false });
  }

  function onShareClick(event, track) {
    if (event.target.closest("[data-close='share']")) {
      closePanel();
      return;
    }
    const tab = event.target.closest("[data-share-tab]");
    if (tab) {
      $$(".share-tab", refs.panelRoot).forEach((node) => node.classList.toggle("active", node === tab));
      $("#sharePoster", refs.panelRoot).classList.toggle("hidden", tab.dataset.shareTab !== "poster");
      $("#shareForum", refs.panelRoot).classList.toggle("hidden", tab.dataset.shareTab !== "forum");
      return;
    }
    const category = event.target.closest("[data-category]");
    if (category) {
      $$(".category", refs.panelRoot).forEach((node) => node.classList.toggle("active", node === category));
      return;
    }
    const action = event.target.closest("[data-share-action]")?.dataset.shareAction;
    if (action === "copy") {
      const text = `${location.href.split("#")[0]}#${encodeURIComponent(track.id)}`;
      navigator.clipboard?.writeText(text).then(() => toast("链接已复制")).catch(() => toast("复制失败，浏览器没有授权剪贴板"));
    }
    if (action === "draft") {
      const content = $("#forumDraft", refs.panelRoot)?.value || "";
      const categoryName = $(".category.active", refs.panelRoot)?.dataset.category || "综合";
      state.drafts = [{ id: `draft-${Date.now()}`, trackId: track.id, title: track.title, artist: track.artist, content, category: categoryName, createdAt: Date.now() }, ...state.drafts].slice(0, 30);
      localStorage.setItem(STORAGE.drafts, JSON.stringify(state.drafts));
      toast("已保存到本地草稿");
    }
  }

  function generatePoster(track) {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1260;
    const ctx = canvas.getContext("2d");
    const hue = track.hue;
    const grad = ctx.createLinearGradient(0, 0, 900, 1260);
    grad.addColorStop(0, `hsl(${hue} 72% 22%)`);
    grad.addColorStop(0.52, `hsl(${(hue + 74) % 360} 70% 18%)`);
    grad.addColorStop(1, "#05070b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 900, 1260);
    drawGlow(ctx, 220, 220, 420, `hsla(${hue}, 90%, 64%, 0.42)`);
    drawGlow(ctx, 710, 610, 520, `hsla(${(hue + 80) % 360}, 90%, 64%, 0.32)`);
    roundRect(ctx, 74, 92, 752, 1076, 42);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.stroke();
    drawPosterCover(ctx, track, 150, 168, 600, 600);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "800 54px system-ui, sans-serif";
    wrapCanvasText(ctx, track.title, 450, 855, 690, 66, 2);
    ctx.fillStyle = "rgba(255,255,255,0.66)";
    ctx.font = "400 30px system-ui, sans-serif";
    wrapCanvasText(ctx, track.artist || "未知艺术家", 450, 960, 660, 40, 2);
    ctx.strokeStyle = `hsl(${hue} 82% 66%)`;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < 36; i++) {
      const x = 250 + i * 11.5;
      const h = 14 + Math.sin(i * 0.8) * 8 + (i % 5) * 2;
      ctx.moveTo(x, 1046 - h);
      ctx.lineTo(x, 1046 + h);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.58)";
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText("萤火音乐墙 · 本地复刻", 450, 1130);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  function drawPosterCover(ctx, track, x, y, w, h) {
    roundRect(ctx, x, y, w, h, 36);
    ctx.save();
    ctx.clip();
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, `hsl(${track.hue} 84% 56%)`);
    grad.addColorStop(0.5, `hsl(${(track.hue + 80) % 360} 78% 48%)`);
    grad.addColorStop(1, `hsl(${(track.hue + 190) % 360} 68% 28%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? "#fff" : "#000";
      ctx.fillRect(x - w + i * 88, y, 34, h);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.font = "900 154px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(glyphs[track.coverSeed % glyphs.length], x + w - 44, y + h - 40);
    ctx.restore();
  }

  function drawGlow(ctx, x, y, radius, color) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const chars = [...text];
    const lines = [];
    let line = "";
    for (const char of chars) {
      const next = line + char;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = char;
      }
      if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
  }

  function updateEmptyState() {
    const empty = state.source === "mine" && state.localTracks.length === 0;
    refs.emptyState?.classList.toggle("hidden", !empty);
  }

  async function refreshLocalTracks() {
    try {
      state.localTracks = (await getAllLocalTracks()).map(recordToTrack);
    } catch (_) {
      state.localTracks = [];
    }
  }

  function recordToTrack(record) {
    return {
      ...record,
      blob: undefined,
      local: true,
      audioKind: "local",
      span: record.span || 1,
      hue: record.hue ?? (record.coverSeed || 0) % 360,
      ratio: record.ratio || 1,
      lyrics: record.lyrics || buildLyrics(record.coverSeed || 0),
    };
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  async function getAllLocalTracks() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const request = tx.objectStore(DB_STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0) || (a.addedAt || 0) - (b.addedAt || 0)));
      request.onerror = () => reject(request.error);
    });
  }

  async function getLocalBlob(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const request = tx.objectStore(DB_STORE).get(id);
      request.onsuccess = () => resolve(request.result?.blob || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function putLocalTrack(record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function deleteLocalTrack(id) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if (state.currentTrackId === id) {
      pauseLocal(false);
      state.currentTrackId = null;
      state.isPlaying = false;
    }
    await refreshLocalTracks();
    applySource(state.source, { silent: true });
    renderPanel("library");
    updatePlaybackViews();
    toast("已删除本地音乐");
  }

  async function clearLocalTracks() {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    pauseLocal(false);
    state.localTracks = [];
    if (findTrack(state.currentTrackId)?.local) {
      state.currentTrackId = null;
      state.isPlaying = false;
    }
    applySource("mine", { silent: true });
    renderPanel("library");
    updatePlaybackViews();
    toast("已清空本地曲库");
  }

  function clearHistory() {
    state.history = [];
    localStorage.setItem(STORAGE.history, "[]");
    renderPanel("history");
  }

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function readString(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function readNumber(key, fallback) {
    const value = Number(readString(key, ""));
    return Number.isFinite(value) ? value : fallback;
  }

  function coverBackground(track) {
    if (track.cover) return `center / cover no-repeat url("${cssUrl(track.cover)}")`;
    return `radial-gradient(circle at 28% 24%, hsla(${track.hue}, 92%, 70%, .95), transparent 34%), conic-gradient(from ${(track.coverSeed % 100) / 100}turn, hsl(${track.hue}, 78%, 38%), hsl(${(track.hue + 70) % 360}, 80%, 55%), hsl(${(track.hue + 190) % 360}, 62%, 28%), hsl(${track.hue}, 78%, 38%))`;
  }

  function cssUrl(url) {
    return String(url).replace(/["\\\n\r]/g, "");
  }

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) return "0:00";
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
  }

  function modeLabel(mode) {
    return ({ list: "列表循环", one: "单曲循环", shuffle: "随机播放", once: "播完停止" })[mode] || "列表循环";
  }

  function visualLabel(mode) {
    return ({ bars: "频谱柱", wave: "流光波形", radial: "环形频谱", particles: "粒子星尘", off: "关闭可视化" })[mode] || "频谱柱";
  }

  function safeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 48) || "music-poster";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function toast(message) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    refs.toastRegion.appendChild(node);
    setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translateY(8px)";
      setTimeout(() => node.remove(), 220);
    }, 2600);
  }

  function icon(name, size = 18) {
    const attrs = `width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"`;
    const paths = {
      play: `<path d="M8 5v14l11-7-11-7Z" fill="currentColor" stroke="none"/>`,
      pause: `<path d="M8 5h3v14H8z" fill="currentColor" stroke="none"/><path d="M13 5h3v14h-3z" fill="currentColor" stroke="none"/>`,
      prev: `<path d="M19 20L9 12l10-8v16Z" fill="currentColor" stroke="none"/><path d="M5 19V5"/>`,
      next: `<path d="M5 4l10 8-10 8V4Z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>`,
      heart: `<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>`,
      close: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
      share: `<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v14"/>`,
      mic: `<path d="m12 8-9 9a2.8 2.8 0 1 0 4 4l9-9"/><circle cx="17" cy="7" r="5"/>`,
      repeat: `<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>`,
      repeatOne: `<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M12 9v6"/><path d="m10.5 10.5 1.5-1.5"/>`,
      shuffle: `<path d="M3 6h3.5c4.6 0 6.4 12 11 12H21"/><path d="m17 14 4 4-4 4"/><path d="M3 18h3.5c1.7 0 3-1.5 4.2-3.5"/><path d="M14.2 8.3c1-1.4 2-2.3 3.3-2.3H21"/><path d="m17 2 4 4-4 4"/>`,
      stop: `<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>`,
      visualBars: `<path d="M4 16V8"/><path d="M8 19V5"/><path d="M12 15V9"/><path d="M16 18V6"/><path d="M20 14v-4"/>`,
      visualWave: `<path d="M2 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-12 5-12 2.5 6 5 6"/>`,
      visualRadial: `<circle cx="12" cy="12" r="5"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="m4.9 4.9 2.2 2.2"/><path d="m16.9 16.9 2.2 2.2"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 19.1 2.2-2.2"/><path d="m16.9 7.1 2.2-2.2"/>`,
      visualParticles: `<circle cx="6" cy="7" r="1.5" fill="currentColor" stroke="none"/><circle cx="17" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="16" r="2"/><circle cx="5" cy="18" r="1" fill="currentColor" stroke="none"/><path d="m10 10 1.2 2.4 2.6.4-1.9 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-1.9-1.9 2.6-.4L10 10Z"/>`,
      visualOff: `<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>`,
      trash: `<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>`,
    };
    return `<svg ${attrs}>${paths[name] || paths.play}</svg>`;
  }

  function setButtonIcon(button, name) {
    if (!button || button.dataset.icon === name) return;
    button.dataset.icon = name;
    button.innerHTML = icon(name, 19);
  }
})();
