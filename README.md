# tesseract-ocr

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) plugin that lets **text-only models** accept attached images: every image is recognized **locally** with [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) and only the recognized **text** is sent to the model API. **Image bytes never leave your machine.**

Tested on Ubuntu (primary target); works anywhere the `tesseract` CLI is installed (Linux, macOS, Windows).

- No configuration changes to your models — no `input: [text, image]` hacks in `settings.yaml`.
- Works with any provider/model in dsh; OCR applies only to text models.
- Genuine vision models (declared image capability) pass images through untouched by default.
- Fail-closed: if the plugin is not loaded, models stay text-only and image attachments are refused — nothing can silently leak.

> Do not enable this plugin together with `windows-ocr`: both would OCR the same image. Pick one per machine.

## Why a plugin (not a skill)

dsh skills are Markdown instruction files injected into the model context — they cannot execute code, cannot hook the request pipeline, and cannot stop an image from being serialized. This feature needs exactly that, so it is a cordis plugin that hooks two public seams of the `llm` service (same design as `windows-ocr`):

1. **Capability shim** — `ctx.llm.resolveModelInfo` (also `listModels`). The host gates image attachments on `inputModalities.includes("image")` at three places: message admission, model switching, and the `read_image` tool. The shim answers "yes", so text models admit images.
2. **Request rewrite** — `registration.adapter.stream` (the single choke point both `ctx.llm.stream` and `prepareCall().stream` funnel through). Every `image` content block is replaced with an OCR text block before the adapter serializes the request, so the adapter's own image check never fires, no attachment bytes are read for the wire, and no `image_url` is ever built.

```
you attach an image
  → admission asks ctx.llm.resolveModelInfo (shimmed: "image" ✓)
  → image stored in the local attachment store (session log, UI preview)
  → agent builds the request → adapter.stream (wrapped)
  → image block read locally (ctx.attachments.readImage) → tesseract CLI
  → block replaced with <image_ocr>…text…</image_ocr>
  → adapter serializes a text-only request → provider
```

## Requirements (Ubuntu)

```bash
sudo apt update
sudo apt install -y tesseract-ocr tesseract-ocr-chi-sim   # chi-sim = Simplified Chinese; add more packages as needed
tesseract --version        # verify
tesseract --list-langs     # verify installed languages
```

Language packs: `tesseract-ocr-eng` (usually pulled in by the base package), `tesseract-ocr-chi-sim`, `tesseract-ocr-chi-tra`, `tesseract-ocr-jpn`, … The `language` config joins multiple tags with `+`, e.g. `eng+chi_sim`.

## Install into dsh

Two official ways to load this plugin, both referencing the plugin file by **absolute path** (see `docs/user/develop/basic`). On Windows the path must be a `file://` URL — a bare `C:/...` path is parsed as the `c:` URL scheme and the loader rejects it. On Linux a plain absolute path works too:

```yaml
name: '/home/you/tesseract-ocr/lib/index.js'
```

### Permanent: profile patch layer

Append to your profile's `cordis.patch.yml` (e.g. `~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - id: tesseract-ocr
      name: '/home/you/tesseract-ocr/lib/index.js'
      config:
        language: eng+chi_sim
        passthrough: true
```

Then restart `dsh web`. Remove the rows to uninstall — nothing else is touched.

### Temporary: `--patch` overlay

Put the same rows in an overlay file and boot with it; your profile stays untouched:

```bash
dsh --profile web --patch /home/you/tesseract-ocr/dev.patch.yml
```

### Notes

- `dsh web` failing with `EADDRINUSE` means an older instance still holds the port: `ss -ltnp | grep 3080`, stop that process, start again.
- For a packaged install (npm / tarball / `github:user/repo`), package the plugin as a bundle (`dsh.bundle` + `cordis.patch.yml`, see `docs/user/develop/basic/publish`); a git install additionally needs a `prepare` build script and pnpm `allowBuilds` consent.

## Configuration

All settings live in the patch row `tesseract-ocr`:

| Key | Default | Meaning |
|---|---|---|
| `language` | `eng` | Tesseract language(s), `+`-joined, e.g. `eng`, `chi_sim`, `eng+chi_sim` |
| `passthrough` | `true` | `true`: genuine vision models receive images untouched; `false`: OCR everything |
| `tesseractBin` | `tesseract` | CLI path; space-separated prefix args allowed, e.g. `/usr/bin/tesseract` |
| `psm` | `3` | Page segmentation mode (`tesseract --psm`) |
| `timeoutMs` | `60000` | Per-image OCR timeout |
| `maxCacheEntries` | `200` | Bound on the per-run OCR cache (keyed by attachment id) |

## How the model sees the image

Each image block becomes a text block:

```
<image_ocr name="photo.png">
…recognized lines…
</image_ocr>
```

Recognition text is cached per attachment id for the lifetime of the dsh process, so repeated turns do not re-run OCR.

## Smoke test (no dsh needed)

```bash
# render a test image with text, then OCR it
convert -size 400x120 xc:white -pointsize 36 -fill black \
  -draw "text 20,80 'Hello OCR 123'" /tmp/ocr-test.png   # ImageMagick; any PNG works
tesseract /tmp/ocr-test.png stdout -l eng --psm 3
```

Exit 0 with the recognized text means Tesseract is ready.

## Verification inside dsh

1. Attach an image to a text-model session and send a message — the model should answer using the recognized text.
2. Confirm the image never goes out: open DevTools → Network in the web UI, inspect the request to your provider base URL, and verify the payload contains only `text` content parts (no `image_url` / data URI).

## Limitations

- Recognition quality depends on the installed language packs and `psm`; tune `language`/`psm` per use case.
- Image formats depend on the Tesseract/Leptonica build: PNG/JPEG/TIFF/BMP are safe; WebP/GIF may require additional Leptonica support.
- Cache is per process; a long-lived session keeps OCR text cached, bounded by `maxCacheEntries`.
- Hot reload (HMR) replaces adapters; the plugin re-wraps new adapters on `llm/adapters-updated`, but a full restart is the safe path after any dsh update.
- If the plugin is removed, image attachments to text models are refused again (fail-closed), not uploaded.

## License

MIT
