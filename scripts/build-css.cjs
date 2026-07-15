"use strict";

const fs = require("fs");
const path = require("path");
const postcss = require("postcss");

const rootDir = path.join(__dirname, "..");
const sourcePath = path.join(rootDir, "src", "styles.css");
const wallPath = path.join(rootDir, "assets", "styles.css");
const playerPath = path.join(rootDir, "assets", "player.css");
const source = postcss.parse(fs.readFileSync(sourcePath, "utf8"), { from: sourcePath });
const wallRoot = postcss.root();
const playerRoot = postcss.root();
const keyframes = [];

splitContainer(source, wallRoot, playerRoot);
appendUsedKeyframes(wallRoot);
appendUsedKeyframes(playerRoot);

fs.writeFileSync(wallPath, `${wallRoot.toString().trim()}\n`);
fs.writeFileSync(playerPath, `${playerRoot.toString().trim()}\n`);

function splitContainer(container, wallParent, playerParent) {
  container.each((node) => {
    if (node.type === "rule") {
      if (isInsideKeyframes(node)) {
        wallParent.append(node.clone());
        playerParent.append(node.clone());
        return;
      }
      const selectors = node.selectors || [];
      const playerSelectors = selectors.filter(isPlayerSelector);
      const wallSelectors = selectors.filter((selector) => !isPlayerSelector(selector));
      if (wallSelectors.length) {
        const clone = node.clone();
        clone.selectors = wallSelectors.map(scopeWallSelector);
        wallParent.append(clone);
      }
      if (playerSelectors.length) {
        const clone = node.clone();
        clone.selectors = playerSelectors;
        playerParent.append(clone);
      }
      return;
    }

    if (node.type === "atrule" && node.nodes) {
      if (/keyframes$/i.test(node.name)) {
        keyframes.push(node.clone());
        return;
      }
      const wallAtRule = node.clone({ nodes: [] });
      const playerAtRule = node.clone({ nodes: [] });
      splitContainer(node, wallAtRule, playerAtRule);
      if (wallAtRule.nodes.length) wallParent.append(wallAtRule);
      if (playerAtRule.nodes.length) playerParent.append(playerAtRule);
      return;
    }

    if (node.type === "comment") {
      wallParent.append(node.clone());
      playerParent.append(node.clone());
      return;
    }

    wallParent.append(node.clone());
  });
}

function appendUsedKeyframes(root) {
  const animationValues = [];
  root.walkDecls(/^animation(?:-name)?$/, (decl) => animationValues.push(decl.value));
  for (const keyframe of keyframes) {
    const name = String(keyframe.params || "").trim();
    if (name && animationValues.some((value) => new RegExp(`(^|[^\\w-])${escapeRegExp(name)}([^\\w-]|$)`).test(value))) {
      root.append(keyframe.clone());
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isInsideKeyframes(node) {
  return node.parent?.type === "atrule" && /keyframes$/i.test(node.parent.name);
}

function isPlayerSelector(selector) {
  return selector.includes(".music-wall-floating-player") || selector.includes(".mw-float-");
}

function scopeWallSelector(selector) {
  const trimmed = selector.trim();
  if (
    trimmed.includes(".music-wall-embed")
    || trimmed.startsWith("body.music-wall-page")
    || trimmed.startsWith("html.music-wall-page")
  ) return trimmed;
  return `.music-wall-embed ${trimmed}`;
}
