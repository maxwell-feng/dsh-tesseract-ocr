# tesseract-ocr — Agent Installation Guide

This document is written for an **AI agent** (or a careful human) that must
install this plugin into a DeepSeek Harness (dsh) installation. Follow the
steps in order and verify each stage before moving on. Do not skip the
verification section — an install is not done until the model answers from an
attached image.

## 0. What this plugin does (30-second summary)

- Lets **text-only models** accept attached images: each image is recognized
  **locally** with the Tesseract CLI, and only the recognized text is sent to
  the model API.
- **Image bytes never leave the machine.** Fail-closed: if the plugin is not
  loaded, image attachments are refused (never uploaded).
- Genuine vision models pass images through untouched by default
  (`passthrough: true`).
- Do **not** enable together with `windows-ocr` on the same machine — both
  would OCR the same image.

## 1. Preflight checks (run all, confirm all)

| Check | Command | Must see |
|---|---|---|
| dsh installed | `dsh --version` | a version like `0.1.0-rc.6` |
| profile exists | `ls ~/.dsh/profiles` | at least one profile (e.g. `web`) |
| profile boots/composes | `dsh --profile web --dump-config` | succeeds, prints rows |
| tesseract installed | `tesseract --version` | e.g. `tesseract 5.x` |
| tesseract languages | `tesseract --list-langs` | `eng` and any language you need (e.g. `chi_sim`) |
| plugin row not already present | `dsh --profile web --dump-config \| grep tesseract-ocr` | nothing (or you must **update** that row instead of inserting a duplicate) |

If `tesseract` is missing, install it and the language packs, e.g. on Debian/Ubuntu:

```bash
sudo apt update && sudo apt install -y tesseract-ocr tesseract-ocr-chi-sim
```

If `dsh` is missing, install it first (e.g. `npm install -g @deepseek-ai/dsh`),
then create/verify the profile.

## 2. Install — choose one mode

Both modes reference the plugin file by **absolute path**. On Linux a plain
absolute path works; on Windows the path in the YAML **must be a `file://`
URL** (a bare `C:/...` path is parsed as the `c:` URL scheme).

### Mode A — permanent (recommended): profile patch layer

1. Edit the profile's user patch file: `~/.dsh/profiles/web/cordis.patch.yml`.
2. Append (adjust the path to the real checkout location):

   ```yaml
   - insert:
       - id: tesseract-ocr
         name: '/home/you/tesseract-ocr/lib/index.js'
         config:
           language: eng+chi_sim
           passthrough: true
           psm: 3
           timeoutMs: 60000
           maxCacheEntries: 200
   ```

   If `dsh --profile web --dump-config | grep tesseract-ocr` already shows a
   `tesseract-ocr` row, do **not** insert a second one (the loader rejects
   duplicate ids) — use an `- update:` entry for that id instead.
3. Verify composition: `dsh --profile web --dump-config` — the row must appear
   under the `# == .../cordis.patch.yml` layer.
4. Restart the dsh web server: stop any running instance, then `dsh web`.

### Mode B — temporary: `--patch` overlay

Put the same rows into an overlay file (e.g. `dev.patch.yml` next to the
checkout) and boot with it; the profile stays untouched:

```
dsh --profile web --patch /home/you/tesseract-ocr/dev.patch.yml
```

## 3. Verify the install (mandatory)

1. The server is up: `dsh web` prints `dsh web: http://127.0.0.1:3080`.
2. OCR engine smoke test (no dsh needed):

   ```bash
   tesseract /path/to/image-with-text.png stdout -l eng --psm 3
   ```

   Exit 0 with recognized text = engine OK. Exit 1 with a `tessdata` error =
   a language pack is missing (`tesseract --list-langs`).
3. Functional test (the real proof):

   - Open the UI at `http://127.0.0.1:3080`, pick a **text-only** model, attach
     an image with text, send a message asking what the text is.
   - Expected: the message is **accepted** (no "model does not support images"
     error) and the model replies with the recognized text.
   - If the UI is not reachable from your environment, drive the API instead
     (see `session.prompt` with an `image` content part containing base64
     data; expect `accepted: true`, then poll `session.history` for an
     `assistant/message` whose text contains the OCR content).
4. Privacy check: in DevTools → Network, the request to the provider base URL
   must contain only `text` content parts — **no `image_url` / data URI**.

## 4. Troubleshooting (errors you will actually hit)

| Symptom | Cause | Fix |
|---|---|---|
| `EADDRINUSE` on 127.0.0.1:3080 | an older dsh instance still runs | `ss -ltnp \| grep 3080` (or `lsof -i:3080`), stop that PID, start again |
| `duplicate loader entry id: tesseract-ocr` | the row already exists (profile patch + `--patch` overlay both add it) | use `- update:` for the existing id, or drop the overlay |
| `ERR_UNSUPPORTED_ESM_URL_SCHEME ... Received protocol 'c:'` | Windows path written as `C:/...` instead of a URL | use `file:///C:/...` in the `name:` field |
| `MISSING_CREDENTIAL: no API key for provider route ...` | the provider has no key | store the route's key (e.g. `DEEPSEEK_API_KEY`) via the web Models page, or export it in the launching environment |
| `dsh` refuses to start: `credentials-local: ... .credentials.yaml is readable beyond its owner (mode 664)` | credential file permissions | `chmod 600 ~/.dsh/.credentials.yaml` |
| `Authentication Fails ... 401` | the key belongs to a different gateway than the provider route | check the route's `baseURL`/`apiKeyEnv` in settings (e.g. an opencode.ai gateway key is not a DeepSeek-official key) |
| `tesseract exited with code 1: ... tessdata ...` | language pack missing | `apt install tesseract-ocr-<lang>`; verify `tesseract --list-langs` |
| model replies `(OCR: no text recognized)` | empty image, or language mismatch | use a text-bearing image; check `language` config |
| model replies `(OCR: failed to recognize this image)` | OCR engine error (logged with `[tesseract-ocr]` prefix) | check the dsh log line for the underlying error |

## 5. Uninstall

Remove the `tesseract-ocr` rows from `cordis.patch.yml` (or stop passing the
overlay) and restart dsh. Nothing else is touched; models return to
text-only and image attachments are refused again (fail-closed).

## 6. Configuration reference

| Key | Default | Meaning |
|---|---|---|
| `language` | `eng` | Tesseract languages, `+`-joined (`eng`, `chi_sim`, `eng+chi_sim`, …) |
| `passthrough` | `true` | `true`: vision models receive images untouched; `false`: OCR everything |
| `tesseractBin` | `tesseract` | CLI path; space-separated prefix args allowed |
| `psm` | `3` | page segmentation mode (`tesseract --psm`) |
| `timeoutMs` | `60000` | per-image OCR timeout |
| `maxCacheEntries` | `200` | OCR cache bound (keyed by attachment id) |

## 7. Temp-file hygiene

Every OCR run writes its image into a fresh `tesseract-ocr-*` temp directory
that is removed automatically on success, error, and timeout. Orphaned
directories from a crashed process are swept at plugin start.

## 8. Submitting to dsh.so — scan-report note

The dsh.so submission checker (https://www.dsh.so/zh/submit) runs automated
static heuristics and attaches the report to the submission Issue for human
review. It is expected to flag this plugin with 2 Critical
(`node:child_process`) and 2 Warning (`fs.writeFile`) findings. Those are
**existence checks, not vulnerabilities in context**; paste the note below
into the submission so the reviewer can close them:

> **Security note for the automated scan findings (2 Critical / 2 Warning):**
> Both findings are static existence checks, not vulnerabilities in context:
> - `node:child_process` (Critical): the plugin must spawn the OCR engine
>   (`tesseract`). The spawn call uses an **argv array without a shell**, so
>   there is no command-injection surface; the binary and all arguments come
>   from admin-controlled config and `mkdtemp`-generated temp paths — never
>   from model or attachment content.
> - `fs.writeFile` (Warning): the plugin writes the image to a fixed filename
>   inside a **fresh `mkdtemp` directory**; the extension comes from a
>   whitelist map with a `png` fallback. No user-controlled path reaches the
>   write.
> Every temp directory is removed in `finally` (success/error/timeout) and
> orphaned dirs are swept at startup. The plugin makes **no network requests**
> and has **zero runtime dependencies**. Independent deep audit (Mimosa):
> 0 findings, 0 vulnerable packages.
