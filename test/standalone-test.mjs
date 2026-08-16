// Standalone pipeline test: mounts the plugin on a mock cordis context and
// verifies the capability shim, the image->OCR rewrite, vision passthrough,
// fail-closed missing-attachment handling, unload restore, and quoted Windows
// paths — without needing a real harness or a real tesseract binary.
//
// Usage: node test/standalone-test.mjs
// (spawns test/mock-tesseract.mjs via the tesseractBin config)

import { fileURLToPath } from "node:url";
import { apply, parseCommandSpec } from "../lib/index.js";

const MOCK = fileURLToPath(new URL("./mock-tesseract.mjs", import.meta.url));
const NODE = process.execPath;
function quoteArg(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}
// Always quote the binary so Windows paths with spaces (Program Files) work.
const MOCK_BIN = `${quoteArg(NODE)} ${quoteArg(MOCK)}`;

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures += 1;
}

// --- parseCommandSpec -------------------------------------------------------
{
  const spaced = parseCommandSpec(MOCK_BIN);
  check("parseCommandSpec keeps quoted binary intact", spaced[0] === NODE);
  check("parseCommandSpec keeps quoted mock path", spaced[1] === MOCK);

  const winPath = String.raw`"C:\Program Files\Tesseract-OCR\tesseract.exe"`;
  const win = parseCommandSpec(winPath);
  check(
    "parseCommandSpec preserves Program Files path",
    win.length === 1 && win[0] === String.raw`C:\Program Files\Tesseract-OCR\tesseract.exe`,
  );

  const withArgs = parseCommandSpec("node ./mock.mjs --flag");
  check(
    "parseCommandSpec splits unquoted prefix args",
    withArgs[0] === "node" && withArgs[1] === "./mock.mjs" && withArgs[2] === "--flag",
  );
}

function makeCtx(llm, attachments) {
  let disposePlugin = null;
  const ctx = {
    get(name) {
      return name === "llm" ? llm : name === "attachments" ? attachments : undefined;
    },
    logger: { warn: (...a) => console.log("WARN:", ...a) },
    on() {
      return () => {};
    },
    effect(factory) {
      disposePlugin = factory();
      return () => {};
    },
  };
  return {
    ctx,
    dispose() {
      if (typeof disposePlugin === "function") disposePlugin();
    },
  };
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
    check("OCR tag has no filename attribute", !text.includes('name="'));
    yield { type: "text", text: "ok" };
  },
};
const origResolve = async () => ({ inputModalities: ["text"] });
const origList = async () => [{ id: "m", inputModalities: ["text"] }];
const llm = {
  resolveModelInfo: origResolve,
  listModels: origList,
  adapters: new Map([["p", { adapter: textAdapter }]]),
};
const attachments = {
  async readImage(ref) {
    return { ref, data: new Uint8Array([1, 2, 3]) };
  },
};
const { ctx, dispose } = makeCtx(llm, attachments);
const origStream = textAdapter.stream;

apply(ctx, {
  language: "eng",
  tesseractBin: MOCK_BIN,
});

// shim
const info = await llm.resolveModelInfo("p", "m");
check("resolveModelInfo shim adds image", info.inputModalities.includes("image"));
const models = await llm.listModels("p");
check("listModels shim adds image", models[0].inputModalities.includes("image"));

// rewrite path
const messages = [
  {
    role: "user",
    content: [
      { type: "text", text: "look" },
      {
        type: "image",
        attachment: {
          attachmentId: "img1",
          mediaType: "image/png",
          bytes: 3,
          width: 1,
          height: 1,
          name: "secret-path.png",
        },
      },
    ],
  },
];
for await (const _c of textAdapter.stream({ provider: "p", model: "m", messages })) {
}

// cache: second call must not re-run OCR
for await (const _c of textAdapter.stream({ provider: "p", model: "m", messages })) {
}

// --- missing attachment is fail-closed (no raw image left) -----------------
{
  let sawImage = false;
  let sawRefusal = false;
  const probe = {
    async *stream(options) {
      for (const message of options.messages) {
        for (const block of message.content ?? []) {
          if (block.type === "image") sawImage = true;
          if (typeof block.text === "string" && block.text.includes("missing attachment")) {
            sawRefusal = true;
          }
        }
      }
      yield { type: "text", text: "refused" };
    },
  };
  const llmMissing = {
    resolveModelInfo: async () => ({ inputModalities: ["text"] }),
    listModels: async () => [],
    adapters: new Map([["p", { adapter: probe }]]),
  };
  const { ctx: ctxMissing, dispose: disposeMissing } = makeCtx(llmMissing, attachments);
  apply(ctxMissing, { tesseractBin: MOCK_BIN });
  for await (const _c of probe.stream({
    provider: "p",
    model: "m",
    messages: [{ role: "user", content: [{ type: "image" }] }],
  })) {
  }
  check("missing attachment leaves no image block", !sawImage);
  check("missing attachment yields refusal text", sawRefusal);
  disposeMissing();
}

// --- default: vision models also OCR (passthrough false) -------------------
{
  const visionDefault = {
    async *stream(options) {
      const hasImage = options.messages.some((m) =>
        (m.content ?? []).some((b) => b?.type === "image"),
      );
      const hasOcr = options.messages.some((m) =>
        (m.content ?? []).some((b) => typeof b.text === "string" && b.text.includes("<image_ocr")),
      );
      check("default passthrough=false OCRs vision models", !hasImage && hasOcr);
      yield { type: "text", text: "ocr ok" };
    },
  };
  const llmVisionDefault = {
    resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }),
    listModels: async () => [],
    adapters: new Map([["v", { adapter: visionDefault }]]),
  };
  const { ctx: ctxVd, dispose: disposeVd } = makeCtx(llmVisionDefault, attachments);
  apply(ctxVd, { tesseractBin: MOCK_BIN });
  for await (const _c of visionDefault.stream({
    provider: "v",
    model: "vision",
    messages,
  })) {
  }
  disposeVd();
}

// --- opt-in vision-model passthrough ----------------------------------------
const visionAdapter = {
  async *stream(options) {
    const hasImage = options.messages.some((m) =>
      (m.content ?? []).some((b) => b?.type === "image"),
    );
    check("vision passthrough keeps image block", hasImage);
    yield { type: "text", text: "vision ok" };
  },
};
const llm2 = {
  resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }),
  listModels: async () => [],
  adapters: new Map([["v", { adapter: visionAdapter }]]),
};
const { ctx: ctx2, dispose: dispose2 } = makeCtx(llm2, attachments);
apply(ctx2, { tesseractBin: MOCK_BIN, passthrough: true });
for await (const _c of visionAdapter.stream({
  provider: "v",
  model: "vision",
  messages,
})) {
}
dispose2();

// --- unload restores originals ---------------------------------------------
dispose();
check("unload restores resolveModelInfo", llm.resolveModelInfo === origResolve);
check("unload restores listModels", llm.listModels === origList);
check("unload restores adapter.stream", textAdapter.stream === origStream);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
