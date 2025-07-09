export function enQuoteString(s: string): string {
  return Array.from(enQuoted(s)).join("");
}

export function deQuoteString(s: string): string {
  return Array.from(deQuoted(s)).join("");
}

export function enQuoteBytes(s: string): string {
  return Array.from(enQuoted(s, { allowUnicode: false })).join("");
}

export function deQuoteBytes(s: string): string {
  return Array.from(deQuoted(s, { allowUnicode: false })).join("");
}

export function bytesEncode(s: string): Uint8Array {
  const encoder = new TextEncoder();
  // Use latin-1 equivalent encoding
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 255) {
      throw new Error(`Character code ${code} exceeds latin-1 range`);
    }
    bytes[i] = code;
  }
  return bytes;
}

export function bytesDecode(b: Uint8Array): string {
  // Use latin-1 equivalent decoding
  return Array.from(b, (byte) => String.fromCharCode(byte)).join("");
}

const NORMAL = 1;
const ESCAPE = 2;
const CPOINT = 3;

const ESCAPE_TABLE: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  n: "\n",
  t: "\t",
  r: "\r",
  f: "\f",
};

const CPOINT_TABLE: Record<string, number> = {
  x: 2,
  u: 4,
  U: 8,
};

const HEX_TABLE: Record<string, number> = {};
for (const c of "0123456789abcdefABCDEF") {
  HEX_TABLE[c] = parseInt(c, 16);
}

export function* deQuoted(
  it: Iterable<string>,
  options: { allowUnicode?: boolean } = {}
): Generator<string, void, unknown> {
  const { allowUnicode = true } = options;
  let acc = 0;
  let cnt = 0;
  let state = NORMAL;

  for (const c of it) {
    if (state === CPOINT) {
      if (!(c in HEX_TABLE)) {
        throw new Error(`Expected hex digit, got: ${c}`);
      }

      acc *= 16;
      acc += HEX_TABLE[c]!;
      cnt -= 1;
      if (cnt === 0) {
        yield String.fromCharCode(acc);
        acc = 0;
        state = NORMAL;
      }
    } else if (state === ESCAPE) {
      if (c in CPOINT_TABLE) {
        if (!allowUnicode && c !== "x") {
          throw new Error(`Unicode escape sequence not allowed: \\${c}`);
        }
        cnt = CPOINT_TABLE[c]!;
        state = CPOINT;
      } else if (c in ESCAPE_TABLE) {
        yield ESCAPE_TABLE[c]!;
        state = NORMAL;
      } else {
        throw new Error(`Unexpected escape sequence: \\${c}`);
      }
    } else if (c === "\\") {
      state = ESCAPE;
    } else {
      yield c;
    }
  }

  if (state === CPOINT) {
    throw new Error("Incomplete Unicode code point");
  } else if (state === ESCAPE) {
    throw new Error("Incomplete escape sequence");
  }
}

const ENQUOTE_TABLE: Record<number, string> = {
  9: "\\t", // '\t'
  10: "\\n", // '\n'
  12: "\\f", // '\f'
  13: "\\r", // '\r'
  34: '\\"', // '"'
  92: "\\\\", // '\\'
};

export function* enQuoted(
  it: Iterable<string>,
  options: { allowUnicode?: boolean } = {}
): Generator<string, void, unknown> {
  const { allowUnicode = true } = options;

  for (const c of it) {
    const code = c.charCodeAt(0);
    if (code in ENQUOTE_TABLE) {
      yield ENQUOTE_TABLE[code]!;
    } else if (32 <= code && code < 127) {
      yield c;
    } else if (code <= 0xff) {
      yield `\\x${code.toString(16).padStart(2, "0")}`;
    } else if (!allowUnicode) {
      throw new Error(`Unicode character not allowed: '${c}' (${code})`);
    } else if (code <= 0xffff) {
      yield `\\u${code.toString(16).padStart(4, "0")}`;
    } else if (code <= 0xffffffff) {
      yield `\\U${code.toString(16).padStart(8, "0")}`;
    } else {
      throw new Error(`Unsupported character: '${c}' (${code})`);
    }
  }
}
