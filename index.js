"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PLUGIN_ROOT = __dirname;
const ASSET_DIR = path.join(PLUGIN_ROOT, "assets");

const DEFAULT_CONFIG = {
  enable: true,
  path: "music",
  title: "萤火音乐墙",
  subtitle: "来自你的云歌单",
  provider: "netease",
  playlist_id: "",
  playlist_url: "",
  meting_api: [
    "https://api.qijieya.cn/meting/",
    "https://music.3e0.cn/",
    "https://meting.mikus.ink/api",
    "https://met.api.xiaoguan.fit/api",
    "https://meting-api.saop.cc/api",
    "https://met.liiiu.cn/api",
    "https://api.injahow.cn/meting/"
  ],
  fallback: true,
  fallback_count: 139,
  enable_local_library: false,
  quality: "high",
  navigation_mode: "auto",
  content_selector: ""
};

if (hexo.extend.injector) {
  hexo.extend.injector.register("head_end", function musicWallHeadInjector() {
    const config = resolveConfig(hexo.config);
    if (config.enable === false) return "";
    const route = normalizeRoute(config.path);
    const assetRoute = route ? `${route}/assets` : "assets";
    const assetBase = joinUrl(hexo.config.root || "/", assetRoute);
    const musicPath = joinUrl(hexo.config.root || "/", route || DEFAULT_CONFIG.path);
    const assetVersion = getAssetVersion();
    const cacheSuffix = assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : "";
    return [
      `<link rel="stylesheet" href="${assetBase}/player.css${cacheSuffix}" data-music-wall-player-style>`,
      renderFirstPaintHead(musicPath, assetBase, cacheSuffix)
    ].join("");
  });

  hexo.extend.injector.register("body_end", function musicWallBodyInjector() {
    const config = resolveConfig(hexo.config);
    if (config.enable === false) return "";
    const route = normalizeRoute(config.path);
    const assetRoute = route ? `${route}/assets` : "assets";
    const assetBase = joinUrl(hexo.config.root || "/", assetRoute);
    const assetVersion = getAssetVersion();
    const cacheSuffix = assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : "";
    const publicConfig = {
      ...buildPublicConfig(config),
      musicPath: joinUrl(hexo.config.root || "/", route || DEFAULT_CONFIG.path),
      assetBase,
      assetVersion
    };
    const json = JSON.stringify(publicConfig).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    return `<script>window.__HEXO_MUSIC_WALL_GLOBAL_CONFIG__ = ${json};</script><script src="${assetBase}/global-player.js${cacheSuffix}" defer></script>`;
  });
}

hexo.extend.generator.register("music_wall", function musicWallGenerator() {
  const config = resolveConfig(this.config);
  if (config.enable === false) return [];

  const route = normalizeRoute(config.path);
  const pagePath = route ? `${route}/index.html` : "index.html";
  const assetRoute = route ? `${route}/assets` : "assets";
  const assetBase = joinUrl(this.config.root || "/", assetRoute);
  const assetVersion = getAssetVersion();
  const publicConfig = buildPublicConfig(config);

  return [
    {
      path: pagePath,
      data: {
        title: publicConfig.title,
        slug: route || DEFAULT_CONFIG.path,
        path: pagePath,
        content: renderComponent(publicConfig, assetBase, assetVersion)
      },
      layout: ["page", "post", "index"]
    },
    {
      path: `${assetRoute}/styles.css`,
      data: fs.readFileSync(path.join(ASSET_DIR, "styles.css"), "utf8"),
      layout: false
    },
    {
      path: `${assetRoute}/app.js`,
      data: fs.readFileSync(path.join(ASSET_DIR, "app.js"), "utf8"),
      layout: false
    },
    {
      path: `${assetRoute}/player.css`,
      data: fs.readFileSync(path.join(ASSET_DIR, "player.css"), "utf8"),
      layout: false
    },
    {
      path: `${assetRoute}/global-player.js`,
      data: fs.readFileSync(path.join(ASSET_DIR, "global-player.js"), "utf8"),
      layout: false
    },
    {
      path: `${assetRoute}/night-alley.jpg`,
      data: fs.readFileSync(path.join(ASSET_DIR, "night-alley.jpg")),
      layout: false
    }
  ];
});

function resolveConfig(hexoConfig) {
  const userConfig = hexoConfig.music_wall || hexoConfig.musicWall || {};
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    meting_api: normalizeApiBases(userConfig.meting_api || userConfig.metingApi || userConfig.api_bases || userConfig.apiBases || DEFAULT_CONFIG.meting_api)
  };
}

function buildPublicConfig(config) {
  return {
    title: config.title,
    subtitle: config.subtitle,
    provider: "netease",
    playlistId: config.playlist_id || config.playlistId || "",
    playlistUrl: config.playlist_url || config.playlistUrl || "",
    apiBases: normalizeApiBases(config.meting_api),
    fallback: config.fallback !== false,
    fallbackCount: Number(config.fallback_count || config.fallbackCount || DEFAULT_CONFIG.fallback_count),
    enableLocalLibrary: false,
    quality: config.quality || config.render_quality || config.renderQuality || DEFAULT_CONFIG.quality,
    navigationMode: normalizeNavigationMode(config.navigation_mode || config.navigationMode),
    contentSelector: String(config.content_selector || config.contentSelector || "").trim()
  };
}

function normalizeApiBases(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return DEFAULT_CONFIG.meting_api;
}

function normalizeRoute(value) {
  return String(value || DEFAULT_CONFIG.path)
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function joinUrl(root, route) {
  const cleanRoot = `/${String(root || "/").replace(/^\/+|\/+$/g, "")}`.replace(/\/+$/, "");
  const cleanRoute = String(route || "").replace(/^\/+|\/+$/g, "");
  return `${cleanRoot === "/" ? "" : cleanRoot}/${cleanRoute}`;
}

function getAssetVersion() {
  const files = ["styles.css", "player.css", "app.js", "global-player.js", "night-alley.jpg"].map((file) => path.join(ASSET_DIR, file));
  const hash = crypto.createHash("sha256");
  for (const file of files) hash.update(fs.readFileSync(file));
  return hash.digest("hex").slice(0, 16);
}

function normalizeNavigationMode(value) {
  const mode = String(value || DEFAULT_CONFIG.navigation_mode).toLowerCase();
  return ["auto", "plugin", "native"].includes(mode) ? mode : DEFAULT_CONFIG.navigation_mode;
}

function renderFirstPaintHead(musicPath, assetBase, cacheSuffix) {
  const pathJson = JSON.stringify(musicPath || "/music");
  const stylesHref = `${assetBase}/styles.css${cacheSuffix}`;
  // Critical shell CSS: paint fullscreen before app.js / full stylesheet arrive.
  // Activated by html.music-wall-page (set by inline script) or :has(.music-wall-embed).
  const criticalCss = `
html.music-wall-page,html.music-wall-page body,body.music-wall-page,body:has(.music-wall-embed){
  height:100dvh!important;max-height:100dvh!important;overflow:hidden!important;background:#03050a!important;
}
html.music-wall-page .article-meta,html.music-wall-page .article-header,html.music-wall-page .post-meta,
html.music-wall-page #comments,html.music-wall-page footer.footer,html.music-wall-page footer#footer,
html.music-wall-page #footer,html.music-wall-page .site-footer,html.music-wall-page #s-top,html.music-wall-page #l_cover,
html.music-wall-page .music-wall-page-sibling,html.music-wall-page .music-wall-page-meta,
body:has(.music-wall-embed) .article-meta,body:has(.music-wall-embed) .article-header,body:has(.music-wall-embed) .post-meta,
body:has(.music-wall-embed) #comments,body:has(.music-wall-embed) footer.footer,body:has(.music-wall-embed) footer#footer,
body:has(.music-wall-embed) #footer,body:has(.music-wall-embed) .site-footer,body:has(.music-wall-embed) #s-top,
body:has(.music-wall-embed) #l_cover{
  display:none!important;
}
html.music-wall-page #safearea,html.music-wall-page .body-wrapper,html.music-wall-page #l_body,html.music-wall-page #l_main,
html.music-wall-page article.post,html.music-wall-page #post-body,
body:has(.music-wall-embed) #safearea,body:has(.music-wall-embed) .body-wrapper,body:has(.music-wall-embed) #l_body,
body:has(.music-wall-embed) #l_main,body:has(.music-wall-embed) article.post,body:has(.music-wall-embed) #post-body{
  margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;
  background:transparent!important;max-width:none!important;width:100%!important;float:none!important;min-height:0!important;
}
html.music-wall-page .music-wall-embed,body.music-wall-page .music-wall-embed,body:has(.music-wall-embed) .music-wall-embed{
  position:fixed!important;top:var(--music-wall-nav-offset,64px)!important;right:0!important;bottom:0!important;left:0!important;
  z-index:40!important;width:auto!important;max-width:none!important;min-height:0!important;margin:0!important;
  height:auto!important;background:#03050a!important;overflow:hidden!important;border-radius:0!important;
}
`.replace(/\s+/g, " ").trim();

  const bootScript = [
    "(function(){try{",
    `var musicPath=${pathJson};`,
    `var stylesHref=${JSON.stringify(stylesHref)};`,
    `var appHref=${JSON.stringify(stylesHref.replace(/styles\.css(?:\?.*)?$/, (m) => m.replace("styles.css", "app.js")))};`,
    "function normalize(p){return String(p||'/').replace(/\\\\/g,'/').replace(/\\/+$/,'')||'/';}",
    "var current=normalize(location.pathname);",
    "var target=normalize(musicPath);",
    "if(current!==target&&current!==target+'/index.html')return;",
    "var root=document.documentElement;",
    "root.classList.add('music-wall-page');",
    "root.style.setProperty('--music-wall-nav-offset','64px');",
    "root.style.setProperty('--music-wall-viewport-height',(window.visualViewport&&window.visualViewport.height?Math.round(window.visualViewport.height):window.innerHeight)+'px');",
    "if(document.body)document.body.classList.add('music-wall-page');",
    "else document.addEventListener('DOMContentLoaded',function(){document.body&&document.body.classList.add('music-wall-page');},{once:true});",
    "if(!document.querySelector('link[data-music-wall-styles]')){var link=document.createElement('link');link.rel='stylesheet';link.href=stylesHref;link.setAttribute('data-music-wall-styles','');document.head.appendChild(link);}",
    "var preload=document.createElement('link');preload.rel='preload';preload.as='style';preload.href=stylesHref;document.head.appendChild(preload);",
    "var preApp=document.createElement('link');preApp.rel='preload';preApp.as='script';preApp.href=appHref;document.head.appendChild(preApp);",
    "}catch(e){}})();"
  ].join("");

  return `<style data-music-wall-critical>${criticalCss}</style><script data-music-wall-boot>${bootScript}</script>`;
}

function renderComponent(config, assetBase, assetVersion) {
  const title = escapeHtml(config.title || DEFAULT_CONFIG.title);
  const subtitle = escapeHtml(config.subtitle || DEFAULT_CONFIG.subtitle);
  const json = JSON.stringify(config).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const cacheSuffix = assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : "";
  return `<link rel="stylesheet" href="${assetBase}/styles.css${cacheSuffix}" data-music-wall-styles />
    <div id="app" class="music-wall-embed" aria-label="${title}">
      <div class="music-wall-status" id="statusLine" aria-live="polite">${subtitle}</div>
      <main id="stage" class="stage" aria-label="音乐墙">
        <div class="parallax-layer" id="parallaxLayer" aria-hidden="true"></div>
        <div class="ambient-scene" aria-hidden="true">
          <div class="street street-a"></div>
          <div class="street street-b"></div>
          <div class="sign sign-a">MUSIC</div>
          <div class="sign sign-b">NOCTURNE</div>
          <div class="window-grid"></div>
        </div>
        <div class="stage-tint" id="stageTint" aria-hidden="true"></div>
        <div class="grain" aria-hidden="true"></div>
        <div class="vignette" aria-hidden="true"></div>
        <canvas class="audio-visualizer" id="visualizerCanvas" aria-hidden="true"></canvas>
        <section class="world" id="world" aria-live="polite"></section>
      </main>
      <div class="focus-layer" id="focusLayer" aria-live="polite"></div>
      <section class="desktop-lyrics hidden" id="desktopLyrics" aria-label="桌面歌词">
        <div class="desktop-lyrics-copy">
          <div class="desktop-lyric-current" id="desktopLyricCurrent"></div>
          <div class="desktop-lyric-next" id="desktopLyricNext"></div>
        </div>
        <button class="desktop-lyrics-close" id="desktopLyricsClose" type="button" aria-label="关闭桌面歌词" title="关闭桌面歌词">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </section>

      <section class="mini-player is-empty" id="miniPlayer" aria-label="播放器">
        <div class="mini-cover" id="miniCover" aria-hidden="true"></div>
        <div class="mini-meta">
          <div class="mini-title" id="miniTitle">还没有播放</div>
          <div class="mini-artist" id="miniArtist">选择一张音乐卡片</div>
        </div>
        <div class="mini-transport" aria-label="播放控制">
          <button class="icon-button mini-transport-button" id="miniPrev" type="button" aria-label="上一首" title="上一首" data-tooltip="上一首">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 20L9 12l10-8v16Z"/><path d="M5 19V5"/></svg>
          </button>
          <button class="play-button mini-play-main" id="miniPlay" type="button" aria-label="播放" title="播放 / 暂停" data-tooltip="播放 / 暂停">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7-11-7Z"/></svg>
          </button>
          <button class="icon-button mini-transport-button" id="miniNext" type="button" aria-label="下一首" title="下一首" data-tooltip="下一首">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4l10 8-10 8V4Z"/><path d="M19 5v14"/></svg>
          </button>
        </div>
        <div class="mini-tools" aria-label="播放器工具">
          <button class="icon-button mini-tool-button" id="miniMode" type="button" aria-label="播放模式" title="切换播放模式" data-tooltip="切换播放模式">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </button>
          <button class="icon-button mini-tool-button" id="miniVisual" type="button" aria-label="视觉效果" title="切换视觉效果" data-tooltip="切换视觉效果">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></svg>
          </button>
          <button class="icon-button mini-tool-button" id="miniLyrics" type="button" aria-label="歌词显示" title="显示 / 隐藏歌词" data-tooltip="显示 / 隐藏歌词">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18h1.2a1.8 1.8 0 0 0 0-3.6h-1.1a1.6 1.6 0 0 1 0-3.2H15a6 6 0 0 0 0-12h-3Z"/><circle cx="7.4" cy="10" r="1"/><circle cx="9" cy="6.8" r="1"/><circle cx="13" cy="6.4" r="1"/><circle cx="16.3" cy="9.3" r="1"/></svg>
          </button>
          <label class="mini-volume-control" aria-label="音量" title="音量" data-tooltip="音量">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5Z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19 6a9 9 0 0 1 0 12"/></svg>
            <input id="volumeSlider" class="volume" type="range" min="0" max="1" step="0.01" aria-label="音量" />
          </label>
          <button class="icon-button mini-tool-button" id="miniLike" type="button" aria-label="喜欢" title="收藏当前歌曲" data-tooltip="收藏当前歌曲">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
          </button>
          <button class="icon-button mini-tool-button" id="miniHistory" type="button" aria-label="播放历史" title="播放历史" data-tooltip="播放历史">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><path d="M12 7v6l4 2"/></svg>
          </button>
        </div>
        <div class="mini-progress-row">
          <span class="mini-time" id="miniCurrent">0:00</span>
          <div class="mini-progress" id="miniProgress" role="slider" tabindex="0" aria-label="播放进度" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="0:00">
            <div class="mini-progress-fill" id="miniProgressFill"></div>
          </div>
          <span class="mini-time" id="miniDuration">0:00</span>
        </div>
      </section>

      <div class="modal-root hidden" id="expandedRoot" aria-hidden="true"></div>
      <div class="modal-root hidden" id="panelRoot" aria-hidden="true"></div>
      <div class="toast-region" id="toastRegion" aria-live="polite"></div>
    </div>

    <script>window.__HEXO_MUSIC_WALL_CONFIG__ = ${json};</script>
    <script src="${assetBase}/app.js${cacheSuffix}" defer></script>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}
