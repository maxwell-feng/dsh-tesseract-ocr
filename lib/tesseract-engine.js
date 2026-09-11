import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommandSpec } from "./command-parser.js";
import { EXT_BY_MEDIA, TEMP_PREFIX } from "./config.js";
import { removeTempDir, terminateChild } from "./temp-cleanup.js";
export class TesseractOcrEngine {
    language;
    tesseractBin;
    psm;
    timeoutMs;
    maxCacheEntries;
    getAttachmentStore;
    warn;
    ocrCache = new Map();
    constructor(options) {
        this.language = options.language;
        this.tesseractBin = options.tesseractBin;
        this.psm = options.psm;
        this.timeoutMs = options.timeoutMs;
        this.maxCacheEntries = options.maxCacheEntries;
        this.getAttachmentStore = options.getAttachmentStore;
        this.warn = options.warn;
    }
    clear() {
        this.ocrCache.clear();
    }
    async ocrText(ref) {
        const key = String(ref.attachmentId);
        let pending = this.ocrCache.get(key);
        if (pending)
            return pending;
        pending = (async () => {
            const store = this.getAttachmentStore();
            if (!store)
                throw new Error("attachment service unavailable");
            const stored = await store.readImage(ref);
            const text = await this.runOcr(stored.data, ref.mediaType);
            return text.trim().length > 0 ? text : "(OCR: no text recognized)";
        })().catch((error) => {
            this.ocrCache.delete(key);
            this.warn?.("[tesseract-ocr] OCR failed for %s: %s", key, error instanceof Error ? error.message : String(error));
            return "(OCR: failed to recognize this image)";
        });
        this.ocrCache.set(key, pending);
        if (this.ocrCache.size > this.maxCacheEntries) {
            const oldest = this.ocrCache.keys().next().value;
            if (oldest !== undefined)
                this.ocrCache.delete(oldest);
        }
        return pending;
    }
    async runOcr(bytes, mediaType) {
        const dir = await fs.mkdtemp(join(tmpdir(), TEMP_PREFIX));
        const imagePath = join(dir, `input.${EXT_BY_MEDIA[mediaType] ?? "png"}`);
        let child;
        try {
            await fs.writeFile(imagePath, bytes);
            const tokens = parseCommandSpec(this.tesseractBin);
            const bin = tokens[0];
            const prefixArgs = tokens.slice(1);
            if (!bin)
                throw new Error("tesseractBin is empty");
            const args = [...prefixArgs, imagePath, "stdout", "-l", this.language, "--psm", String(this.psm)];
            return await new Promise((resolve, reject) => {
                child = spawn(bin, args, {
                    windowsHide: true,
                    stdio: ["ignore", "pipe", "pipe"],
                });
                let stdout = "";
                let stderr = "";
                let settled = false;
                const settle = (fn, value) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timer);
                    fn(value);
                };
                const settleErr = (error) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timer);
                    reject(error);
                };
                child.stdout?.on("data", (chunk) => {
                    stdout += chunk;
                });
                child.stderr?.on("data", (chunk) => {
                    stderr += chunk;
                });
                const timer = setTimeout(() => {
                    void terminateChild(child).then(() => {
                        settleErr(new Error("tesseract timed out"));
                    });
                }, this.timeoutMs);
                child.on("error", (error) => {
                    settleErr(error);
                });
                child.on("close", (code) => {
                    if (code === 0)
                        settle(resolve, stdout);
                    else {
                        settleErr(new Error(`tesseract exited with code ${code}: ${stderr.trim().slice(0, 300)}`));
                    }
                });
            });
        }
        finally {
            if (child)
                await terminateChild(child);
            await removeTempDir(dir, this.warn);
        }
    }
}
