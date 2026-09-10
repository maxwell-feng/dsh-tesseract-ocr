# Usage Guide

English | [简体中文](USAGE.zh.md)

> Verified against DeepSeek Harness **0.1.5-rc.1**.

Attach any image to a text-model session and send a message — the plugin
intercepts `agent/pre-step`, OCRs the image locally via the `tesseract` CLI,
and replaces the `image` block with a text block before the request is built.
No code or model-config changes needed; every provider/model in dsh benefits.
See [Configuration Guide](CONFIG.md) for the full option reference.

---

## 1. OCR parameters

Three options control each recognition run. All three fall back to their
defaults when unset or invalid (empty `language`, negative `psm`,
non-positive `timeoutMs`):

| Option | Default | How it is used |
| :--- | :--- | :--- |
| `language` | `"eng"` | Passed as `tesseract … -l <language>`; join tags with `+`, e.g. `"eng+chi_sim"`. Requires matching tessdata (`tesseract --list-langs`). |
| `psm` | `3` | Passed as `tesseract … --psm <n>` (page segmentation mode). See `tesseract --help` for the mode list. |
| `timeoutMs` | `60000` | Per-image timeout in milliseconds. On timeout the child process is terminated and the turn degrades to a placeholder (below) instead of failing. |

### Example: bilingual documents

```yaml
- id: tesseract-ocr
  config:
    language: "eng+chi_sim"
    psm: 3
    timeoutMs: 60000
```

Same run at the CLI (what the plugin executes per image):

```bash
tesseract ./invoice.png stdout -l eng+chi_sim --psm 3
```

### Example: fast interactive replies

```yaml
- id: tesseract-ocr
  config:
    language: "eng"
    psm: 3
    timeoutMs: 15000
```

### Example: single uniform text block screenshots

```yaml
- id: tesseract-ocr
  config:
    language: "eng"
    psm: 6
    timeoutMs: 30000
```

---

## 2. How the model sees the image

Each image block becomes a text block (local filenames are **not**
forwarded):

```
<image_ocr>
…recognized lines…
</image_ocr>
```

When recognition yields nothing useful, the block carries a placeholder
instead of an empty string, so the model always has something to respond to:

| Situation | Model sees |
| :--- | :--- |
| Text recognized | `<image_ocr>` + recognized text + `</image_ocr>` |
| Blank image / no text | `(OCR: no text recognized)` |
| Engine error or timeout | `(OCR: failed to recognize this image)` (details in the dsh log) |
| Image block without an attachment reference | `(OCR: missing attachment — image refused)` (never left as raw `image`) |

Recognition text is cached per attachment id for the lifetime of the dsh
process (bounded by `maxCacheEntries`, default `200`), so repeated turns do
not re-run OCR.

---

## 3. Vision-model passthrough (opt-in)

By default (`passthrough: false`) **every** image is OCR'd, including images
addressed to genuine vision models. Set `passthrough: true` only when you
intentionally want vision-capable routes to receive original image bytes;
text-only routes are still OCR'd.
