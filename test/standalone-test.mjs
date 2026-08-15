// Standalone pipeline test: mounts the plugin on a mock cordis context and
// verifies the capability shim, the image->OCR rewrite, and vision passthrough
// without needing a real harness or a real tesseract binary.
//
// Usage: node test/standalone-test.mjs
// (spawns test/mock-tesseract.mjs via the tesseractBin config)

import { fileURLToPath } from "node:url";
import { apply } from "../lib/index.js";

const MOCK = fileURLToPath(new URL("./mock-tesseract.mjs", import.meta.url));
const NODE = process.execPath;

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures += 1;
}

// --- text-model adapter: image must be replaced with OCR text ---------------
const textAdapter = {
  async *stream(options) {
    const seen = [];
    for (const message of options.messages) {
      for (const block of message.content ?? []) {
        seen.push(block.type === "text" ? block.text : `[${block.type}]`);
      }
    }
    const text = seen.join("\n");
    check("adapter received no image block", !text.includes("[image]"));
    check("adapter received OCR text", text.includes("Hello OCR 123"));
    check("OCR tag present", text.includes("<image_ocr"));
    yield { type: "text", text: "ok" };
  },
};
const llm = {
  resolveModelInfo: async () => ({ inputModalities: ["text"] }),
  listModels: async () => [{ id: "m", inputModalities: ["text"] }],
  adapters: new Map([["p", { adapter: textAdapter }]]),
};
const attachments = {
  async readImage(ref) {
    return { ref, data: new Uint8Array([1, 2, 3]) };
  },
};
const ctx = {
  get(name) {
    return name === "llm" ? llm : name === "attachments" ? attachments : undefined;
  },
  logger: { warn: (...a) => console.log("WARN:", ...a) },
  on() { return () => {}; },
  effect() { return () => {}; },
};

apply(ctx, {
  language: "eng",
  tesseractBin: `${NODE} ${MOCK}`,
});

// shim
const info = await llm.resolveModelInfo("p", "m");
check("resolveModelInfo shim adds image", info.inputModalities.includes("image"));
const models = await llm.listModels("p");
check("listModels shim adds image", models[0].inputModalities.includes("image"));

// rewrite path
const messages = [
  { role: "user", content: [
    { type: "text", text: "look" },
    { type: "image", attachment: { attachmentId: "img1", mediaType: "image/png", bytes: 3, width: 1, height: 1, name: "t.png" } },
  ]},
];
for await (const _c of textAdapter.stream({ provider: "p", model: "m", messages })) {}

// cache: second call must not re-run OCR (mock would still print; count spawns
// by checking the adapter path runs once more — cache is internal, so just
// verify the pipeline still yields text)
for await (const _c of textAdapter.stream({ provider: "p", model: "m", messages })) {}

// --- vision-model passthrough ------------------------------------------------
const visionAdapter = {
  async *stream(options) {
    const hasImage = options.messages.some((m) =>
      (m.content ?? []).some((b) => b?.type === "image"));
    check("vision passthrough keeps image block", hasImage);
    yield { type: "text", text: "vision ok" };
  },
};
const llm2 = {
  resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }),
  listModels: async () => [],
  adapters: new Map([["v", { adapter: visionAdapter }]]),
};
const ctx2 = {
  ...ctx,
  get: (n) => (n === "llm" ? llm2 : n === "attachments" ? attachments : undefined),
};
apply(ctx2, { tesseractBin: `${NODE} ${MOCK}` });
for await (const _c of visionAdapter.stream({ provider: "v", model: "vision", messages })) {}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
