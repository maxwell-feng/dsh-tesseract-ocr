# 使用说明文档 (Usage Guide)

[English](USAGE.md) | 简体中文

> 本版本已在 DeepSeek Harness **0.1.5-rc.1** 最新发布版本上全面验证。

任意图片附加到文本模型会话并发送——插件在 `agent/pre-step` 拦截，本地经
`tesseract` 命令行识别，并在请求构建前将 `image` 块替换为文本块。无需改动
任何代码或模型配置；dsh 中所有 provider/模型均受益。完整配置项见
[配置说明文档](CONFIG.zh.md)。

---

## 1. OCR 参数

以下三个选项控制每次识别。未设置或非法时（空 `language`、负数 `psm`、
非正数 `timeoutMs`）都会回退到默认值：

| 选项 | 默认值 | 用法 |
| :--- | :--- | :--- |
| `language` | `"eng"` | 以 `tesseract … -l <language>` 传入；多语言用 `+` 连接，如 `"eng+chi_sim"`。需装好对应 tessdata（`tesseract --list-langs`）。 |
| `psm` | `3` | 以 `tesseract … --psm <n>` 传入（页面分割模式）。模式列表见 `tesseract --help`。 |
| `timeoutMs` | `60000` | 单张图片超时（毫秒）。超时会终止子进程，本轮以占位文本降级（见下表），不会让对话失败。 |

### 示例：中英混合文档

```yaml
- id: tesseract-ocr
  config:
    language: "eng+chi_sim"
    psm: 3
    timeoutMs: 60000
```

等价的命令行（插件对每张图实际执行的命令）：

```bash
tesseract ./invoice.png stdout -l eng+chi_sim --psm 3
```

### 示例：交互式快速回复

```yaml
- id: tesseract-ocr
  config:
    language: "eng"
    psm: 3
    timeoutMs: 15000
```

### 示例：整块文字截图

```yaml
- id: tesseract-ocr
  config:
    language: "eng"
    psm: 6
    timeoutMs: 30000
```

---

## 2. 模型看到什么

每个图片块变成一个文本块（**不会**把本地文件名发给服务商）：

```
<image_ocr>
…识别出的文字行…
</image_ocr>
```

识别无果时，文本块会携带占位符而非空字符串，模型总有可回复的内容：

| 情形 | 模型看到的内容 |
| :--- | :--- |
| 识别出文字 | `<image_ocr>` + 识别文字 + `</image_ocr>` |
| 空白图片 / 无文字 | `(OCR: no text recognized)` |
| 引擎报错或超时 | `(OCR: failed to recognize this image)`（详情见 dsh 日志） |
| 图片块缺少附件引用 | `(OCR: missing attachment — image refused)`（绝不留下原始 `image` 块） |

识别结果按附件 id 在 dsh 进程生命周期内缓存（受 `maxCacheEntries` 限制，
默认 `200`），重复轮次不会重复 OCR。

---

## 3. 视觉模型透传（显式开启）

默认（`passthrough: false`）**所有**图片一律 OCR，包括发往真视觉模型的图
片。只有在你明确需要时，才把 `passthrough: true`，让视觉模型接收原图字
节；纯文本模型仍会被 OCR。
