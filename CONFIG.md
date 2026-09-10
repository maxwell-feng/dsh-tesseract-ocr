# Configuration Guide

English | [简体中文](CONFIG.zh.md)

This document describes all configuration options, type contracts, and defaults for `dsh-tesseract-ocr`.

---

## 1. Options Reference

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `language` | `string` | `"eng"` | Tesseract language code(s), e.g. `"chi_sim"`, `"chi_sim+eng"`. Requires matching tessdata installed. |
| `passthrough` | `boolean` | `false` | When `false` (default), all images are OCR'd locally. When `true`, true multimodal models receive image bytes. |
| `tesseractBin` | `string` | `"tesseract"` | Path or executable name of the `tesseract` binary. |
| `psm` | `number` | `3` | Page segmentation mode (PSM). Default `3` is fully automatic page segmentation without OSD. |
| `timeoutMs` | `number` | `60000` | Maximum time in milliseconds for one OCR invocation. |
| `maxCacheEntries` | `number` | `200` | Maximum number of OCR results cached in memory, keyed by attachment id (oldest entry evicted first). |

---

## 2. Profile Patch Example (`cordis.patch.yml`)

Add to `$DSH_HOME/profiles/<profile>/cordis.patch.yml`:

```yaml
- id: tesseract-ocr
  config:
    language: "chi_sim+eng"
    tesseractBin: "tesseract"
    passthrough: false
    psm: 3
    timeoutMs: 30000
    maxCacheEntries: 500
```
