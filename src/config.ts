import Schema from "@deepseek-ai/schemastery";
import type { Config as PluginConfig } from "./types.ts";

export const EXT_BY_MEDIA: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const TEMP_PREFIX = "tesseract-ocr-";
export const MISSING_ATTACHMENT_TEXT = "(OCR: missing attachment — image refused)";

/**
 * Loader-time configuration schema (docs/user/develop/basic/config). The
 * loader validates and fills defaults before apply() runs; apply() keeps its
 * defensive fallbacks so direct callers (tests) see identical behavior.
 */
export const Config: Schema<PluginConfig> = Schema.object({
  language: Schema.string().default("eng"),
  passthrough: Schema.boolean().default(false),
  tesseractBin: Schema.string().default("tesseract"),
  psm: Schema.number().default(3),
  timeoutMs: Schema.number().default(60000),
  maxCacheEntries: Schema.number().default(200),
});
