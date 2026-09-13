# 配置说明文档 (Configuration Guide)

[English](CONFIG.md) | 简体中文

> 已在 DeepSeek Harness **0.1.5-rc.2** 上随 `dsh-tesseract-ocr` **0.8.1** 完成全面验证。

本文档详细说明 `dsh-tesseract-ocr` 插件在 DeepSeek Harness 中的全部配置项、默认值与跨平台设置技巧。

---

## 1. 字段配置列表

所有字段由 `@deepseek-ai/schemastery` 在加载时执行严格校验。

| 配置字段 | 类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `language` | `string` | `"eng"` | Tesseract 识别语言代码。支持组合，例如 `"chi_sim"`（简体中文）、`"chi_sim+eng"`（中英混合）。需已在系统或 tessdata 中下载对应语言包。 |
| `passthrough` | `boolean` | `false` | **视觉模型原图透传开关**。默认为 `false`（严格本地离线 OCR，图片不出内网，仅发送提取文字）；设为 `true` 时，原生支持视觉输入的多模态模型将接收原始图片字节。 |
| `tesseractBin` | `string` | `"tesseract"` | Tesseract 可执行文件路径。若已在系统 PATH 中，保持默认即可；否则可指定绝对路径（如 `"C:\\Program Files\\Tesseract-OCR\\tesseract.exe"` 或 `"/usr/bin/tesseract"`）。 |
| `psm` | `number` | `3` | Tesseract 页面分割模式 (Page Segmentation Mode)。默认为 `3`（全自动页面分割，无需方向检测），单行文字可设为 `7`。 |
| `timeoutMs` | `number` | `60000` | 单次 OCR 执行的最大超时时间（毫秒）。超时将杀死子进程并自动回收临时目录。 |
| `maxCacheEntries` | `number` | `200` | 内存中按附件 id 缓存的 OCR 文本条目上限（超限时优先淘汰最早的条目）。 |

---

## 2. 静态配置示例 (`cordis.patch.yml`)

在 Profile 的 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 中添加配置：

```yaml
- id: tesseract-ocr
  config:
    language: "chi_sim+eng"             # 中英文混合识别
    tesseractBin: "tesseract"           # 可指定为自定义路径
    passthrough: false                  # 保持严格隐私保护
    psm: 3
    timeoutMs: 30000
    maxCacheEntries: 500
```

---

## 3. Tesseract 语言包安装建议

- **Ubuntu / Debian / Termux**:
  ```bash
  pkg install tesseract tesseract-tessdata-chi-sim # Termux
  apt-get install tesseract-ocr tesseract-ocr-chi-sim # Ubuntu
  ```
- **Windows**:
  下载安装 [UB-Mannheim/tesseract](https://github.com/UB-Mannheim/tesseract/wiki)，并在安装向导中勾选 "Additional language data (download)" 下的 "Chinese (Simplified)"。
