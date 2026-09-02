# tesseract-ocr

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) plugin that lets **text-only models** accept attached images: every image is recognized **locally** with [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) and only the recognized **text** is sent to the model API.

**Privacy default:** image bytes are OCR'd locally and not sent to the provider. Set `passthrough: true` only if you intentionally want genuine vision models to receive original image bytes.

Tested on Ubuntu (primary target); works anywhere the `tesseract` CLI is installed (Linux, macOS, Windows). Verified against dsh `0.1.2-alpha.5` (master).

- No configuration changes to your models — no `input: [text, image]` hacks in `settings.yaml`.
- Works with any provider/model in dsh; by default every attached image is OCR'd before the request leaves the machine.
- Vision-model passthrough is **opt-in** (`passthrough: true`).
- Fail-closed: if the plugin is not loaded, models stay text-only and image attachments are refused — nothing can silently leak. Missing attachments are replaced with a refusal text block (never left as raw `image`).

> Do not enable this plugin together with `windows-ocr`: both would OCR the same image. Pick one per machine.

## Install from npm

```bash
dsh plugin --profile web add dsh-tesseract-ocr
```

(Replace `web` with your profile, e.g. `tui`.) Prebuilt and published with Sigstore provenance — no source build or `allowBuilds` approval needed. Installing from source (this repo) still works via the agent guide or the manual steps below.

or from the repository / a tarball:

```bash
dsh plugin --profile web add ./dsh-tesseract-ocr        # source checkout
dsh plugin --profile web add ./dsh-tesseract-ocr-0.3.2.tgz
dsh plugin --profile web add github:maxwell-feng/dsh-tesseract-ocr
```

> Git installs fetch sources, not built artifacts: the package's `prepare`
> script runs `tsc` to rebuild `lib/` from source, and pnpm ≥ 10 requires you
> to allow the build once (it prints the exact `pnpm-workspace.yaml` snippet).

> **npm install registers the `tesseract-ocr` row by itself.** The package
> ships a bundle patch (`dsh.bundle` + its own `cordis.patch.yml`) that
> inserts the `tesseract-ocr` loader entry. Do **not** also add a manual
> `- insert:` row with the same id to your profile — dsh `0.1.2-alpha.5`
> rejects duplicate loader entry ids and
> `dsh web` fails to boot with `duplicate loader entry id: tesseract-ocr`.

## Quick install via an AI agent

Hand this repository to any AI agent, or paste the instruction below, and the
agent will install and verify the plugin for you:

> Please install the dsh plugin in this repository by following
> <https://github.com/maxwell-feng/dsh-tesseract-ocr/blob/main/agents-install.md>.
> Run every preflight check, choose an install mode, then complete the
> mandatory verification: attach an image to a text-only model session and
> confirm the model answers with the recognized text.

[`agents-install.md`](./agents-install.md) is a step-by-step guide written for
AI agents: preflight checks (including installing Tesseract and language
packs), both install modes (permanent profile patch / temporary `--patch`
overlay), mandatory functional verification, and troubleshooting for the
failure modes you are likely to hit. Manual install instructions are below.

## Why a plugin (not a skill)

dsh skills are Markdown instruction files injected into the model context — they cannot execute code, cannot hook the request pipeline, and cannot stop an image from being serialized. This feature needs exactly that, so it is a cordis plugin that hooks two public seams of the `llm` service (same design as `windows-ocr`):

1. **Capability shim** — `ctx.llm.resolveModelInfo` (also `listModels`). The host gates image attachments on `inputModalities.includes("image")` at three places: message admission, model switching, and the `read_image` tool. The shim answers "yes", so text models admit images.
2. **Pre-step rewrite** — `agent/pre-step`, the harness's official seam for replacing the messages that enter a model call ("Reject a proposed step or replace the messages that enter it"). Every `image` content block is replaced with an OCR text block before the request is built, so no attachment bytes are ever serialized and no `image_url` is ever built. It covers every dispatch path — `ctx.llm.stream` and `prepareCall().stream` both build from the step's messages; wrapping `adapter.stream` no longer works because the bundled adapters override `prepareCall()` and dispatch through generation-bound closures.

```
you attach an image
  → admission asks ctx.llm.resolveModelInfo (shimmed: "image" ✓)
  → image stored in the local attachment store (session log, UI preview)
  → agent loop proposes a step → agent/pre-step (rewritten)
  → image block read locally (ctx.attachments.readImage) → tesseract CLI
  → block replaced with <image_ocr>…text…</image_ocr>
  → request built from OCR'd messages → adapter serializes text only → provider
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

### Installing via an AI agent

[`agents-install.md`](./agents-install.md) in this repository is a
step-by-step installation guide written **for AI agents** (and careful
humans). Give it to an agent — e.g. "install this plugin per
`agents-install.md` from https://github.com/maxwell-feng/dsh-tesseract-ocr" —
and the agent can perform the preflight checks, install, verification, and
troubleshooting on its own. The guide covers both install modes, the
mandatory functional verification (attach an image → model answers with the
OCR text), and the failure modes you are likely to hit.

### Manual install

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
        passthrough: false
```

Then restart `dsh web`. Remove the rows to uninstall — the plugin restores the original `llm` / adapter methods on unload.

> Choose **one** way to load the plugin: the npm bundle (above) **or** this
> manual insert — never both. Both register the same `tesseract-ocr` entry id,
> and dsh `0.1.2-alpha.5` fails the boot with `duplicate loader entry id:
> tesseract-ocr` when the row exists twice. If the row is already present (for
> example after an npm bundle install), configure it with an id-targeted
> override row instead of inserting a second one.

### Temporary: `--patch` overlay

Put the same rows in an overlay file and boot with it; your profile stays untouched:

```bash
dsh --profile web --patch /home/you/tesseract-ocr/dev.patch.yml
```

### Notes

- `dsh web` failing with `EADDRINUSE` means an older instance still holds the port: `ss -ltnp | grep 3080`, stop that process, start again.
- For a packaged install (npm / tarball / `github:user/repo`), package the plugin as a bundle (`dsh.bundle` + `cordis.patch.yml`, see `docs/user/develop/basic/publish`); a git install additionally needs a `prepare` build script and pnpm `allowBuilds` consent.

## Configuration

All settings live in the patch row `tesseract-ocr`. Configuration is
validated at load time (Schemastery `Config` schema) — an invalid value fails
the boot with an actionable error instead of being silently ignored:

| Key | Default | Meaning |
|---|---|---|
| `language` | `eng` | Tesseract language(s), `+`-joined, e.g. `eng`, `chi_sim`, `eng+chi_sim` |
| `passthrough` | `false` | `false` (default): OCR every image. `true`: genuine vision models receive images untouched |
| `tesseractBin` | `tesseract` | CLI path; quote paths with spaces, e.g. `"C:\Program Files\Tesseract-OCR\tesseract.exe"` |
| `psm` | `3` | Page segmentation mode (`tesseract --psm`) |
| `timeoutMs` | `60000` | Per-image OCR timeout |
| `maxCacheEntries` | `200` | Bound on the per-run OCR cache (keyed by attachment id) |

## Usage

Attach any image to a text-model session and send a message — the plugin intercepts `agent/pre-step`, OCRs the image locally via the `tesseract` CLI, and replaces the `image` block with a text block before the request is built. No code or model-config changes needed; every provider/model in dsh benefits.

## How the model sees the image

Each image block becomes a text block (local filenames are **not** forwarded):

```
<image_ocr>
…recognized lines…
</image_ocr>
```

Recognition text is cached per attachment id for the lifetime of the dsh process, so repeated turns do not re-run OCR.

## Temp-file hygiene

Every OCR run writes its input image into a **fresh temporary directory**
(`tesseract-ocr-*` under the system temp dir). On timeout the child process is
terminated and awaited before cleanup. The directory is removed in `finally`
(with one retry and a warning log on failure) — on success, on OCR error, and
on timeout — so no per-run image file survives. At plugin start, any orphaned
`tesseract-ocr-*` directories left behind by a previously crashed process are
swept as well. Nothing is written outside the plugin's own temporary directory
and the dsh attachment store.

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

## Uninstall

```bash
dsh plugin --profile web remove dsh-tesseract-ocr
```

For manual installs, delete the `tesseract-ocr` row from your profile's `cordis.patch.yml` and restart `dsh --profile web`. The plugin restores the original `llm` shims on unload; a full restart is safest after removal. After uninstall, text-model image attachments are refused again (fail-closed).

## Limitations

- Recognition quality depends on the installed language packs and `psm`; tune `language`/`psm` per use case.
- Image formats depend on the Tesseract/Leptonica build: PNG/JPEG/TIFF/BMP are safe; WebP/GIF may require additional Leptonica support.
- Cache is per process; a long-lived session keeps OCR text cached, bounded by `maxCacheEntries`.
- The plugin registers one fiber-scoped `agent/pre-step` listener and restores the `llm` capability shims on unload. A full restart is still the safest path after any dsh update.
- If the plugin is removed, image attachments to text models are refused again (fail-closed), not uploaded.
- Package name on npm is `dsh-tesseract-ocr` (unscoped) to avoid colliding with the unrelated `tesseract-ocr` package.

## License

MIT
