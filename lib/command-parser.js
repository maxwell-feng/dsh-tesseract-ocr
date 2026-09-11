/**
 * Split a CLI spec into argv tokens, respecting double/single quotes so
 * Windows paths like `"C:\Program Files\Tesseract-OCR\tesseract.exe"` work.
 * Unquoted whitespace still separates prefix args (for test mocks:
 * `node /path/to/mock.mjs`).
 */
export function parseCommandSpec(spec) {
    const tokens = [];
    const matches = spec.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g);
    for (const match of matches) {
        const token = match[1] ?? match[2] ?? match[3];
        if (token !== undefined && token.length > 0)
            tokens.push(token);
    }
    return tokens;
}
