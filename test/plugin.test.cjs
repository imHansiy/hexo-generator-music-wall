"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("生成主题隔离的音乐页与全局播放器资源", () => {
  const registrations = { injectors: {}, generators: {} };
  global.hexo = {
    config: {
      root: "/blog/",
      music_wall: {
        path: "music",
        playlist_id: "382154102",
        navigation_mode: "plugin",
        content_selector: "#content-inner",
      },
    },
    extend: {
      injector: {
        register(name, handler) {
          registrations.injectors[name] = handler;
        },
      },
      generator: {
        register(name, handler) {
          registrations.generators[name] = handler;
        },
      },
    },
  };

  const pluginPath = require.resolve("../index.js");
  delete require.cache[pluginPath];
  require(pluginPath);

  const head = registrations.injectors.head_end();
  const body = registrations.injectors.body_end();
  const routes = registrations.generators.music_wall.call({ config: global.hexo.config });
  const routeMap = new Map(routes.map((route) => [route.path, route]));

  assert.match(head, /\/blog\/music\/assets\/player\.css\?v=/);
  assert.doesNotMatch(head, /styles\.css/);
  assert.match(body, /"navigationMode":"plugin"/);
  assert.match(body, /"contentSelector":"#content-inner"/);
  assert.match(body, /"assetBase":"\/blog\/music\/assets"/);
  assert.ok(routeMap.has("music/assets/player.css"));
  assert.ok(routeMap.has("music/assets/styles.css"));
  assert.ok(routeMap.has("music/assets/app.js"));
  assert.ok(routeMap.has("music/assets/global-player.js"));
  assert.match(routeMap.get("music/index.html").data.content, /music\/assets\/styles\.css\?v=/);
  assert.match(routeMap.get("music/index.html").data.content, /music\/assets\/app\.js\?v=/);

  const wallCss = fs.readFileSync(path.join(__dirname, "..", "assets", "styles.css"), "utf8");
  const playerCss = fs.readFileSync(path.join(__dirname, "..", "assets", "player.css"), "utf8");
  assert.match(wallCss, /\.music-wall-embed \.icon-button/);
  assert.doesNotMatch(wallCss, /^\.icon-button/m);
  assert.match(playerCss, /\.music-wall-floating-player/);
  assert.doesNotMatch(playerCss, /^\.stage/m);

  const globalPlayer = fs.readFileSync(path.join(__dirname, "..", "assets", "global-player.js"), "utf8");
  const wallApp = fs.readFileSync(path.join(__dirname, "..", "assets", "app.js"), "utf8");
  assert.match(globalPlayer, /state\.drag\.suppressClick && !action/);
  assert.match(globalPlayer, /dispatchPlaybackCommand\("pause"\)/);
  assert.match(globalPlayer, /root\.addEventListener\("pointerdown"/);
  assert.match(globalPlayer, /runPlayerAction\(action\)/);
  assert.match(globalPlayer, /collapsed: true/);
  assert.match(globalPlayer, /href="\$\{MUSIC_PATH\}"/);
  assert.match(globalPlayer, /进入音乐墙/);
  assert.doesNotMatch(globalPlayer, /data-action="collapse"/);
  assert.doesNotMatch(globalPlayer, /!link \|\| event\.defaultPrevented/);
  assert.match(globalPlayer, /window\.addEventListener\("pointerdown"/);
  assert.match(globalPlayer, /event\.pointerType !== "mouse"/);
  assert.match(globalPlayer, /window\.addEventListener\("pjax:send", guardThemePjaxSend, true\)/);
  assert.match(globalPlayer, /event\.stopImmediatePropagation\(\)/);
  assert.match(globalPlayer, /function refreshGlobalPlayerFromSharedAudio\(\)/);
  assert.match(globalPlayer, /function runNavigationCompleteHooks\(url\)/);
  assert.match(globalPlayer, /volantisComplete\.call/);
  assert.match(globalPlayer, /pjaxScripts: collectPjaxScripts\(nextDocument, url\.href\)/);
  assert.match(globalPlayer, /pjaxScripts: collectPjaxScripts\(document, location\.href\)/);
  assert.match(globalPlayer, /function collectPjaxScripts\(targetDocument, sourceUrl\)/);
  assert.match(globalPlayer, /targetDocument\.querySelectorAll\("pjax script"\)/);
  assert.match(globalPlayer, /runPjaxScripts\(nextEntry\.pjaxScripts\)/);
  assert.match(globalPlayer, /runNavigationCompleteHooks\(url\.href\);\s+window\.dispatchEvent\(new CustomEvent\("hexo-music-wall:navigated"/);
  assert.match(globalPlayer, /state\.musicPageActive \? 240 : 34/);
  assert.match(wallApp, /hexo-music-wall:playback-command/);
  assert.match(wallApp, /function onMusicWallNavigateBefore\(\)/);
  assert.match(wallApp, /document\.addEventListener\("pjax:send", onThemePjaxSend\)/);
  assert.match(wallApp, /document\.addEventListener\("pjax:complete", onThemePjaxComplete\)/);
  assert.match(wallApp, /incomingApp !== refs\.app/);
  assert.match(wallApp, /function installMountObserver\(\)/);
  assert.match(wallApp, /observer\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(wallApp, /window\.setInterval\(reconcileMusicWallMount, 300\)/);
  assert.match(wallApp, /function installStageResizeObserver\(\)/);
  assert.match(wallApp, /state\.stageResizeObserver\.observe\(refs\.stage\)/);
  assert.match(wallApp, /const maxPixels = state\.performanceLite \? 1_350_000 : 2_200_000/);
  assert.match(wallApp, /function reconcileMusicWallMount\(\)/);
  assert.match(wallApp, /if \(!incomingApp\)/);
  assert.match(wallApp, /const needsActivation = !state\.mountPresent \|\| replaced \|\| !state\.pageActive/);
  assert.match(wallApp, /function restorePlaybackFromSharedState\(\)/);
  assert.match(wallApp, /function initializeTrackSelection\(\)/);
  assert.match(wallApp, /function selectDefaultTrack\(\)/);
  assert.match(wallApp, /const track = state\.tracks\[0\]/);
  assert.match(wallApp, /state\.hasPlaybackStarted = false/);
  assert.match(wallApp, /!track \|\| !state\.hasPlaybackStarted/);
  assert.match(wallApp, /!state\.lyricsEnabled \|\| !track \|\| !state\.hasPlaybackStarted/);
  assert.match(globalPlayer, /playbackRuntime\.hasPlaybackStarted = true/);
  assert.match(wallApp, /function startFrameLoop\(\)/);
  assert.match(wallApp, /if \(!state\.pageActive \|\| !refs\.app\?\.isConnected\)/);
  assert.match(wallApp, /rebuildLayout\(\);\s+centerWorld\(\);\s+state\.initializedPosition = true/);
  assert.match(wallApp, /focusTrackInWall\(state\.currentTrackId, \{ immediate: true, resetTile: true \}\)/);
  assert.match(wallApp, /const ix = options\.resetTile \? 0/);
});
