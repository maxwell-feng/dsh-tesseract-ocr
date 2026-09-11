import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommandSpec } from "./command-parser.js";
import { EXT_BY_MEDIA, TEMP_PREFIX } from "./config.js";
import { removeTempDir, terminateChild } from "./temp-cleanup.js";
import type { AttachmentStore, ImageAttachmentRef } from "./types.js";

export interface TesseractEngineOptions {
  language: string;
  tesseractBin: string;
  psm: number;
  timeoutMs: number;
  maxCacheEntries: number;
  getAttachmentStore: () => AttachmentStore | undefined;
  warn?: (message: string, ...args: unknown[]) => void;
}

export class TesseractOcrEngine {
  private language: string;
  private tesseractBin: string;
  private psm: number;
  private timeoutMs: number;
  private maxCacheEntries: number;
  private getAttachmentStore: () => AttachmentStore | undefined;
  private warn?: (message: string, ...args: unknown[]) => void;
  private ocrCache = new Map<string, Promise<string>>();

  constructor(options: TesseractEngineOptions) {
    this.language = options.language;
    this.tesseractBin = options.tesseractBin;
    this.psm = options.psm;
    this.timeoutMs = options.timeoutMs;
    this.maxCacheEntries = options.maxCacheEntries;
    this.getAttachmentStore = options.getAttachmentStore;
    this.warn = options.warn;
  }

  public clear(): void {
    this.ocrCache.clear();
  }

  public async ocrText(ref: ImageAttachmentRef): Promise<string> {
    const key = String(ref.attachmentId);
    let pending = this.ocrCache.get(key);
    if (pending) return pending;

    pending = (async () => {
      const store = this.getAttachmentStore();
      if (!store) throw new Error("attachment service unavailable");
      const stored = await store.readImage(ref);
      const text = await this.runOcr(stored.data, ref.mediaType);
      return text.trim().length > 0 ? text : "(OCR: no text recognized)";
    })().catch((error: unknown) => {
      this.ocrCache.delete(key);
      this.warn?.(
        "[tesseract-ocr] OCR failed for %s: %s",
        key,
        error instanceof Error ? error.message : String(error),
      );
      return "(OCR: failed to recognize this image)";
    });

    this.ocrCache.set(key, pending);
    if (this.ocrCache.size > this.maxCacheEntries) {
      const oldest = this.ocrCache.keys().next().value;
      if (oldest !== undefined) this.ocrCache.delete(oldest);
    }
    return pending;
  }

  private async runOcr(bytes: Uint8Array, mediaType: string): Promise<string> {
    const dir = await fs.mkdtemp(join(tmpdir(), TEMP_PREFIX));
    const imagePath = join(dir, `input.${EXT_BY_MEDIA[mediaType] ?? "png"}`);
    let child: ChildProcess | undefined;

    try {
      await fs.writeFile(imagePath, bytes);
      const tokens = parseCommandSpec(this.tesseractBin);
      const bin = tokens[0];
      const prefixArgs = tokens.slice(1);
      if (!bin) throw new Error("tesseractBin is empty");
      const args = [...prefixArgs, imagePath, "stdout", "-l", this.language, "--psm", String(this.psm)];

      return await new Promise<string>((resolve, reject) => {
        child = spawn(bin, args, {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let settled = false;

        const settle = (fn: (value: string) => void, value: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn(value);
        };
        const settleErr = (error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        };

        child.stdout?.on("data", (chunk: Buffer) => {
          stdout += chunk;
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk;
        });

        const timer = setTimeout(() => {
          void terminateChild(child!).then(() => {
            settleErr(new Error("tesseract timed out"));
          });
        }, this.timeoutMs);

        child.on("error", (error: Error) => {
          settleErr(error);
        });
        child.on("close", (code: number | null) => {
          if (code === 0) settle(resolve, stdout);
          else {
            settleErr(
              new Error(`tesseract exited with code ${code}: ${stderr.trim().slice(0, 300)}`),
            );
          }
        });
      });
    } finally {
      if (child) await terminateChild(child);
      await removeTempDir(dir, this.warn);
    }
  }
}
