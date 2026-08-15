// Mock tesseract CLI for local (non-Linux) pipeline tests.
// Usage: node mock-tesseract.mjs <imagePath> stdout [-l <lang>] [--psm <n>]
// Ignores the actual image and prints a fixed recognition result.
const args = process.argv.slice(2);
const imagePath = args[0];
console.log(`[mock-tesseract] invoked on ${imagePath} ${args.slice(1).join(" ")}`);
console.log("Hello OCR 123");
