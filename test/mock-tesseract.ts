// Mock tesseract CLI for local pipeline tests (TypeScript).
// Usage: node --experimental-strip-types mock-tesseract.ts <imagePath> stdout [-l <lang>] [--psm <n>]
const args = process.argv.slice(2);
const imagePath = args[0];
console.log(`[mock-tesseract] invoked on ${imagePath} ${args.slice(1).join(" ")}`);
console.log("Hello OCR 123");
