# Install Guide

English | [简体中文](INSTALL.zh.md)

> Verified against DeepSeek Harness **0.1.5-rc.1**.

This document explains how to install `dsh-tesseract-ocr` into a DeepSeek
Harness profile. For a step-by-step guide written for AI agents (preflight
checks, mandatory functional verification, troubleshooting), see
[`agents-install.md`](agents-install.md).

---

## 1. Requirements

- DeepSeek Harness `0.1.5-rc.1` or newer (`dsh --version`).
- Node.js `>=22` (matches the harness engine requirement).
- The `tesseract` CLI plus the language packs you need:

```bash
sudo apt update && sudo apt install -y tesseract-ocr tesseract-ocr-chi-sim
tesseract --version        # verify, e.g. tesseract 5.x
tesseract --list-langs     # verify installed languages
```

---

## 2. Install from npm (recommended)

```bash
dsh plugin --profile web add dsh-tesseract-ocr
```

(Replace `web` with your profile, e.g. `tui`.) The npm bundle registers the
`tesseract-ocr` loader row by itself via its own `cordis.patch.yml` — do
**not** also add a manual `- insert:` row with the same id; dsh `0.1.5-rc.1`
rejects duplicate loader entry ids and `dsh web` fails to boot with
`duplicate loader entry id: tesseract-ocr`.

---

## 3. Install from source, tarball, or GitHub

```bash
dsh plugin --profile web add ./dsh-tesseract-ocr        # source checkout
dsh plugin --profile web add ./dsh-tesseract-ocr-0.5.0.tgz
dsh plugin --profile web add github:maxwell-feng/dsh-tesseract-ocr
```

> Git installs fetch sources, not built artifacts: the package's `prepare`
> script runs `tsc` to rebuild `lib/` from source, and pnpm ≥ 10 requires you
> to allow the build once (it prints the exact `pnpm-workspace.yaml` snippet).

---

## 4. Manual install (absolute plugin path)

Both modes reference the built plugin file by **absolute path**. On Linux a
plain absolute path works; on Windows the path in the YAML **must be a
`file://` URL** (a bare `C:/...` path is parsed as the `c:` URL scheme).

### Permanent: profile patch layer

Append to your profile's `cordis.patch.yml` (e.g.
`~/.dsh/profiles/web/cordis.patch.yml`):

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

If a `tesseract-ocr` row already exists (for example after an npm bundle
install), do **not** insert a second one — configure it with an id-targeted
override row instead:

```yaml
- id: tesseract-ocr
  config:
    language: eng+chi_sim
    passthrough: false
    psm: 3
    timeoutMs: 60000
    maxCacheEntries: 200
```

Then restart `dsh web`.

### Temporary: `--patch` overlay

Put the same rows in an overlay file and boot with it; your profile stays
untouched:

```bash
dsh --profile web --patch /home/you/tesseract-ocr/dev.patch.yml
```

---

## 5. Verify

1. Composition: `dsh --profile web --dump-config` must show the
   `tesseract-ocr` row exactly once.
2. Engine smoke test (no dsh needed):

   ```bash
   tesseract /path/to/image-with-text.png stdout -l eng --psm 3
   ```

   Exit 0 with recognized text means Tesseract is ready.
3. Functional test: attach an image to a text-only model session and send a
   message — the model should answer using the recognized text (see
   [Usage Guide](USAGE.md)).
