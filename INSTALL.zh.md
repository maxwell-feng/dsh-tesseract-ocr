# 安装说明文档 (Install Guide)

[English](INSTALL.md) | 简体中文

> 本版本已在 DeepSeek Harness **0.1.5-rc.1** 最新发布版本上全面验证。

本文档介绍如何把 `dsh-tesseract-ocr` 安装到 DeepSeek Harness 的指定
Profile。写给 AI agent 的分步手册（含前置检查、强制功能验证、故障排查）见
[`agents-install.md`](agents-install.md)。

---

## 1. 环境要求

- DeepSeek Harness `0.1.5-rc.1` 或更新版本（`dsh --version`）。
- Node.js `>=22`（与 harness 的引擎要求一致）。
- `tesseract` 命令行及所需的语言包：

```bash
sudo apt update && sudo apt install -y tesseract-ocr tesseract-ocr-chi-sim
tesseract --version        # 验证，如 tesseract 5.x
tesseract --list-langs     # 查看已装语言
```

---

## 2. 从 npm 安装（推荐）

```bash
dsh plugin --profile web add dsh-tesseract-ocr
```

（把 `web` 换成你的 profile，如 `tui`。）npm 包自带 bundle 补丁，会自行注册
`tesseract-ocr` 这一行——请**不要**再手动 `- insert:` 一行同 id 的条目；dsh
`0.1.5-rc.1` 会拒绝重复的 loader 条目 id，`dsh web` 会以
`duplicate loader entry id: tesseract-ocr` 启动失败。

---

## 3. 从源码、tarball 或 GitHub 安装

```bash
dsh plugin --profile web add ./dsh-tesseract-ocr        # 源码目录
dsh plugin --profile web add ./dsh-tesseract-ocr-0.5.0.tgz
dsh plugin --profile web add github:maxwell-feng/dsh-tesseract-ocr
```

> Git 安装拿到的是源码而非构建产物：包的 `prepare` 脚本会运行 `tsc` 从源码
> 重建 `lib/`，并且 pnpm ≥ 10 需要一次性允许构建（它会打印确切的
> `pnpm-workspace.yaml` 片段）。

---

## 4. 手动安装（插件绝对路径）

两种方式都用**绝对路径**指向构建好的插件文件。Linux 直接写绝对路径即可；
Windows 上路径必须是 `file://` URL——裸写 `C:/...` 会被解析成 `c:` URL
scheme。

### 永久安装：profile 补丁层

在 profile 的 `cordis.patch.yml`（如
`~/.dsh/profiles/web/cordis.patch.yml`）追加：

```yaml
- insert:
    - id: tesseract-ocr
      name: '/home/you/tesseract-ocr/lib/index.js'
      config:
        language: eng+chi_sim
        passthrough: false
        psm: 3
        timeoutMs: 60000
        maxCacheEntries: 200
```

如果 `tesseract-ocr` 行已经存在（例如已按 npm bundle 方式安装），请**不要**
再插入一行——改用按 id 覆盖的行改配置：

```yaml
- id: tesseract-ocr
  config:
    language: eng+chi_sim
    passthrough: false
    psm: 3
    timeoutMs: 60000
    maxCacheEntries: 200
```

然后重启 `dsh web`。

### 临时加载：`--patch` overlay

把同样的行写进一个 overlay 文件，启动时带上；profile 保持不动：

```bash
dsh --profile web --patch /home/you/tesseract-ocr/dev.patch.yml
```

---

## 5. 验证安装

1. 组成检查：`dsh --profile web --dump-config` 必须恰好显示一行
   `tesseract-ocr`。
2. 引擎冒烟测试（不需要 dsh）：

   ```bash
   tesseract /path/to/image-with-text.png stdout -l eng --psm 3
   ```

   退出码 0 且输出识别文字，说明 Tesseract 就绪。
3. 功能验证：在纯文本模型会话里附加一张图片并发送——模型应能引用识别出的
   文字作答（见[使用说明文档](USAGE.zh.md)）。
