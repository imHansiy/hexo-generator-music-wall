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
| `meting_api` | 内置两个公开接口 | Meting API 地址，可填数组或逗号分隔字符串 |
| `fallback` | `true` | 歌单接口失败时是否显示占位曲目 |
| `fallback_count` | `139` | 占位曲目数量 |
| `enable_local_library` | `false` | 已默认关闭；当前版本面向网易云歌单展示 |
| `quality` | `high` | 渲染质量；默认高画质，只有显式设为 `fast` / `lite` / `low` / `performance` 时才启用轻量模式 |

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
- 站内无缝播放会接管普通的同源内部链接，使用 History API 更换 Hexo 主内容。外链、下载链接、新窗口链接和站内锚点保持浏览器原生行为。
