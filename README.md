# hexo-generator-music-wall

一个 Hexo 网易云音乐墙插件。安装后会在默认路径 `/music/` 生成一个嵌入博客主题布局的音乐页，你可以在主题导航里直接跳转到这个路径。

页面效果包括 3D 音乐卡片墙、拖拽/滚轮视差、播放控制、收藏、历史、歌词和分享海报。网易云音乐歌单会通过 Meting API 在浏览器端读取；接口不可用时会自动回退到占位曲目，页面仍可浏览。播放后在站内切换页面会保留同一个播放引擎，音乐不会因 Hexo 页面跳转而中断。

## 安装

在 Hexo 站点目录中安装：

```bash
npm install hexo-generator-music-wall
```

本地开发时也可以安装本仓库：

```bash
npm install /path/to/hexo-generator-music-wall
```

## 配置

在 Hexo 站点的 `_config.yml` 中添加：

```yaml
music_wall:
  enable: true
  path: music
  title: 网易云音乐
  subtitle: 来自网易云歌单
  playlist_id: "123456789"
```

也可以直接填歌单链接，插件会尽量解析 ID：

```yaml
music_wall:
  path: music
  playlist_url: "https://music.163.com/#/playlist?id=123456789"
```

## 配置项

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enable` | `true` | 是否启用插件 |
| `path` | `music` | 生成路径，默认访问 `/music/` |
| `title` | `萤火音乐墙` | 页面标题 |
| `subtitle` | `来自你的云歌单` | 顶部副标题 |
| `playlist_id` | 空 | 歌单 ID |
| `playlist_url` | 空 | 歌单链接，可代替 `playlist_id` |
| `meting_api` | 内置多个公开节点 | Meting API 地址，可填数组或逗号分隔字符串；按顺序自动回退 |
| `fallback` | `true` | 歌单接口失败时是否显示占位曲目 |
| `fallback_count` | `139` | 占位曲目数量 |
| `enable_local_library` | `false` | 已默认关闭；当前版本面向网易云歌单展示 |
| `quality` | `high` | 渲染质量；默认高画质，只有显式设为 `fast` / `lite` / `low` / `performance` 时才启用轻量模式 |
| `navigation_mode` | `auto` | 跨页导航模式：`auto`、`plugin` 或 `native` |
| `content_selector` | 空 | 自定义主题主内容容器，例如 `#content-inner`；留空时自动识别 |

## 主题兼容

音乐墙样式和悬浮播放器样式彼此独立，音乐墙内部样式统一限制在 `.music-wall-embed` 下，不会覆盖主题中同名的 `.panel`、`.stage`、`.icon-button` 等组件。

插件会自动识别以下常见内容容器：

```text
#l_main
#main
main#content-inner
#content-inner
main#board
#board
.main-inner
main
```

如果主题使用其他容器，可以显式配置：

```yaml
music_wall:
  content_selector: ".your-theme-content"
```

导航模式说明：

- `auto`：默认模式。进入音乐页、离开音乐页或已经存在播放状态时，插件接管导航以保持音频不中断；其他时候继续使用主题原生导航。
- `plugin`：所有同源站内链接都由插件接管，适合没有 PJAX 的简单主题。
- `native`：完全交给主题处理，兼容主题自带 PJAX，但普通整页刷新时浏览器无法保持音频不中断。

目前已对 Hexo 默认 Landscape 和 Volantis 进行实际回归。Butterfly、NexT、Fluid 使用的常见内容容器已纳入自动识别；主题深度改造过 DOM 时建议配置 `content_selector`。

默认的 Meting 回退顺序为：

```yaml
music_wall:
  meting_api:
    - https://api.qijieya.cn/meting/
    - https://music.3e0.cn/
    - https://meting.mikus.ink/api
    - https://met.api.xiaoguan.fit/api
    - https://meting-api.saop.cc/api
    - https://met.liiiu.cn/api
    - https://api.injahow.cn/meting/
```

插件会在歌单查询失败时切换节点；播放单曲时也会根据网易云资源 ID 重建备用音频 URL。

## 导航

例如主题导航配置可以写：

```yaml
menu:
  音乐: /music/
```

如果你把 `path` 改成 `playlist`，则导航路径写 `/playlist/`。

## 注意

- 网易云音乐数据依赖浏览器端请求第三方 Meting API，接口可用性、跨域和音频授权由接口与音乐平台决定。
- 如果歌单返回了封面但没有可播放音频，页面会展示音乐墙和封面，并在播放时提示音频暂不可用。
- `auto` 模式只在音乐相关导航或已有播放状态时接管同源内部链接，使用 History API 更换 Hexo 主内容；外链、下载链接、新窗口链接和站内锚点保持浏览器原生行为。
- 内置的公开 Meting 节点为第三方社区服务，不由本插件或网易云音乐运营，可用性可能随时变化。生产环境建议在 `meting_api` 最前面配置自己部署的节点。
