# tesseract-ocr

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）插件：让**纯文本模型**也能"看"附件图片——图片在**本机**用 [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) 识别，只有识别出的**文字**会发给模型 API。

**隐私默认：** 图片在本地 OCR，不把原图发给服务商。只有在你明确需要时，才把 `passthrough` 设为 `true`，让真正的视觉模型接收原图。

主要目标平台 Ubuntu（已测试）；只要装了 `tesseract` CLI 就能用（Linux / macOS / Windows）。已在 dsh `0.1.0-rc.7` 上验证。

- 不需要改任何模型配置——不用在 `settings.yaml` 里给模型加 `input: [text, image]`。
- 对 dsh 里的任何 provider/模型通用；默认所有附件图片都会先 OCR 再出站。
- 视觉模型透传是**显式开启**（`passthrough: true`）。
- 默认安全（fail-closed）：插件没加载时，模型保持纯文本，图片附件会被拒绝——不存在静默泄漏。缺失附件会被替换成拒绝文本，不会留下原始 `image` 块。

> 不要与 `windows-ocr` 插件同时启用：两者会对同一张图各跑一次 OCR。每台机器二选一。

## npm 安装

```bash
dsh plugin --profile web add @maxwell-feng/dsh-tesseract-ocr
```

（把 `web` 换成你的 profile，如 `tui`。）预编译发布（含 Sigstore provenance），无需源码构建或 `allowBuilds` 授权。从本仓库源码安装仍可用下方 agent 指南或手动步骤。

> **npm 安装会自行注册 `tesseract-ocr` 这一行。** 该包自带 bundle 补丁（`dsh.bundle` + 它自己的 `cordis.patch.yml`），已经插入了 `tesseract-ocr` 这个 loader 条目。请**不要**再往 profile 里手动 `- insert:` 一行同 id 的条目——dsh `0.1.0-rc.7`（cordis-plugin-loader `1.0.2`）会拒绝重复的 loader 条目 id，`dsh web` 会以 `duplicate loader entry id: tesseract-ocr` 启动失败。

## 让 AI agent 快速安装

把这个仓库交给任何 AI agent，或直接粘贴下面的指令，agent 会替你完成安装与验证：

> 请按照 <https://github.com/maxwell-feng/dsh-tesseract-ocr/blob/main/agents-install.md> 安装本仓库的 dsh 插件。执行每一项前置检查（包括安装 Tesseract 与语言包），选择一种安装方式，然后完成强制验证：在纯文本模型会话里附加一张图片，确认模型能答出图片中的文字。

[`agents-install.md`](./agents-install.md) 是一份写给 AI agent 的分步手册：前置检查（含 Tesseract 与语言包安装）、两种安装方式（profile 永久 / `--patch` 临时）、强制功能验证，以及常见失败模式的排查。手动安装说明见下文。

## 为什么是插件而不是 skill

dsh 的 skill 只是注入模型上下文的 Markdown 指令：不能执行代码、不能钩住请求管线、更拦不住图片被序列化上传。这个功能恰好需要这些，所以它是一个 cordis 插件，钩住 `llm` 服务的两个公开接缝（与 `windows-ocr` 同一设计）：

1. **能力声明（shim）**——包装 `ctx.llm.resolveModelInfo`（以及 `listModels`）。宿主在三处用 `inputModalities.includes("image")` 拦截图片：发送准入、切换模型、`read_image` 工具。shim 让回答变成"支持"，文本模型即可收图。
2. **请求改写**——包装 `registration.adapter.stream`（`ctx.llm.stream` 和 `prepareCall().stream` 两条路径的唯一汇聚点）。适配器序列化请求前，所有 `image` 内容块已被替换成 OCR 文本块，适配器的图片检查永远不会触发，附件字节不会为出站请求被读取，也永远不会生成 `image_url`。

```
你附加图片
  → 准入层问 ctx.llm.resolveModelInfo（shim 返回含 "image" ✓）
  → 图片存入本地附件库（会话日志、UI 预览）
  → agent 组装请求 → adapter.stream（被包装）
  → 本地读取图片字节（ctx.attachments.readImage）→ tesseract CLI
  → 图片块替换为 <image_ocr>…识别文字…</image_ocr>
  → 适配器序列化纯文本请求 → 发给服务商
```

## 环境要求（Ubuntu）

```bash
sudo apt update
sudo apt install -y tesseract-ocr tesseract-ocr-chi-sim   # chi-sim = 简体中文；需要其他语言再加
tesseract --version        # 验证安装
tesseract --list-langs     # 查看已装语言
```

语言包：`tesseract-ocr-eng`（基础包一般自带）、`tesseract-ocr-chi-sim`（简体）、`tesseract-ocr-chi-tra`（繁体）、`tesseract-ocr-jpn` 等。`language` 配置用 `+` 连接多个语言，如 `eng+chi_sim`。

## 安装到 dsh

### 让 AI agent 安装

本仓库的 [`agents-install.md`](./agents-install.md) 是一份**写给 AI agent**（也适合细心的人工）的分步安装手册。把这份文档交给 agent——例如对它说"按照 https://github.com/maxwell-feng/dsh-tesseract-ocr 的 `agents-install.md` 安装这个插件"——agent 就能自主完成前置检查、安装、验证和故障排查。手册涵盖两种安装方式、必须做的功能验证（附加图片 → 模型回答 OCR 文字）以及常见的失败模式。

### 手动安装

两种官方加载方式，patch 行都用**绝对路径**指向插件文件（见 `docs/user/develop/basic`）。Windows 上路径必须是 `file://` URL——裸写 `C:/...` 会被解析成 `c:` URL scheme；Linux 直接写绝对路径即可：

```yaml
name: '/home/you/tesseract-ocr/lib/index.js'
```

### 永久安装：profile 补丁层

在 profile 的 `cordis.patch.yml`（如 `~/.dsh/profiles/web/cordis.patch.yml`）追加：

```yaml
- insert:
    - id: tesseract-ocr
      name: '/home/you/tesseract-ocr/lib/index.js'
      config:
        language: eng+chi_sim
        passthrough: false
```

然后重启 `dsh web`。删掉这几行即卸载；插件会在卸载时恢复原来的 `llm` / adapter 方法。

> **两种加载方式二选一**：npm bundle（上文）**或**这里的手动 insert——绝不能同时用。两者注册的是同一个 `tesseract-ocr` 条目 id，而 dsh `0.1.0-rc.7` 在行重复出现时会以 `duplicate loader entry id: tesseract-ocr` 拒绝启动。如果这一行已经存在（例如已按 npm bundle 方式安装），请用按 id 覆盖的行改配置，而不是再插入一行。

### 临时加载：`--patch` overlay

把同样的行写进一个 overlay 文件，启动时带上；profile 保持不动：

```bash
dsh --profile web --patch /home/you/tesseract-ocr/dev.patch.yml
```

### 注意事项

- `dsh web` 报端口占用（`EADDRINUSE`）说明有旧实例在跑：`ss -ltnp | grep 3080` 找到进程并停止后再启动。
- 打包分发（npm / tarball / `github:user/repo`）时按组合包方式打包（`dsh.bundle` + `cordis.patch.yml`，见 `docs/user/develop/basic/publish`）；git 安装还需要 `prepare` 构建脚本和 pnpm `allowBuilds` 授权。

## 配置

所有配置都在 `tesseract-ocr` 这一行：

| 键 | 默认 | 含义 |
|---|---|---|
| `language` | `eng` | Tesseract 语言，`+` 连接多个，如 `eng`、`chi_sim`、`eng+chi_sim` |
| `passthrough` | `false` | `false`（默认）：所有图片一律 OCR；`true`：真视觉模型原样透传图片 |
| `tesseractBin` | `tesseract` | CLI 路径；含空格的路径请加引号，如 `"C:\Program Files\Tesseract-OCR\tesseract.exe"` |
| `psm` | `3` | 页面分割模式（`tesseract --psm`） |
| `timeoutMs` | `60000` | 单张图片 OCR 超时（毫秒） |
| `maxCacheEntries` | `200` | 单次运行 OCR 缓存上限（按附件 id） |

## 模型看到什么

每个图片块变成一个文本块（**不会**把本地文件名发给服务商）：

```
<image_ocr>
…识别出的文字行…
</image_ocr>
```

识别结果按附件 id 在 dsh 进程生命周期内缓存，重复轮次不会重复 OCR。

## 临时文件自动清理

每次 OCR 都会把输入图片写入系统临时目录下**新建的临时目录**（`tesseract-ocr-*`）。超时会先终止并等待子进程退出，再在 `finally` 中删除（失败会重试一次并打警告日志）——成功、OCR 报错、超时都会删——每次产生的图片文件不会残留。插件启动时还会清扫上次进程崩溃遗留的孤儿 `tesseract-ocr-*` 目录。除插件自己的临时目录和 dsh 附件库外，不写任何其他位置。

## 冒烟测试（不需要 dsh）

```bash
# 生成一张带文字的测试图，然后 OCR
convert -size 400x120 xc:white -pointsize 36 -fill black \
  -draw "text 20,80 'Hello OCR 123'" /tmp/ocr-test.png   # 需要 ImageMagick；任意 PNG 均可
tesseract /tmp/ocr-test.png stdout -l eng --psm 3
```

退出码 0 且输出识别文字，说明 Tesseract 就绪。

## 在 dsh 里验证

1. 在文本模型会话里附加一张图片并发送——模型应能引用识别出的文字作答。
2. 确认图片没出站：web UI 打开 DevTools → Network，查看发往服务商 baseURL 的请求，确认 payload 里只有 `text` 内容块（没有 `image_url`/data URI）。

## 已知限制

- 识别质量取决于已装语言包和 `psm`；按场景调 `language`/`psm`。
- 支持的图片格式取决于 Tesseract/Leptonica 构建：PNG/JPEG/TIFF/BMP 稳妥；WebP/GIF 可能需要额外的 Leptonica 支持。
- 缓存按进程存活；长会话的 OCR 文本会缓存，受 `maxCacheEntries` 限制。
- 热重载（HMR）会替换适配器；插件会在 `llm/adapters-updated` 时重新包装新适配器，但 dsh 升级后建议完整重启。
- 移除插件后，文本模型的图片附件会重新被拒绝（fail-closed），不会被上传。

## License

MIT
