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
});
