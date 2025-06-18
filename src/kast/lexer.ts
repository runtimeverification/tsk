export enum TokenType {
  EOF = "EOF",
  LPAREN = "LPAREN",
  RPAREN = "RPAREN",
  COMMA = "COMMA",
  COLON = "COLON",
  KSEQ = "KSEQ",
  DOTK = "DOTK",
  DOTKLIST = "DOTKLIST",
  TOKEN = "TOKEN",
  ID = "ID",
  VARIABLE = "VARIABLE",
  SORT = "SORT",
  KLABEL = "KLABEL",
  STRING = "STRING",
}

export interface Token {
  text: string;
  type: TokenType;
}

enum State {
  DEFAULT = "DEFAULT",
  SORT = "SORT",
}

export function* lexer(text: Iterable<string>): Generator<Token> {
  let state = State.DEFAULT;
  const it = text[Symbol.iterator]();
  let la = it.next().value || "";

  while (true) {
    // Skip whitespace
    while (la && /\s/.test(la)) {
      la = it.next().value || "";
    }

    if (!la) {
      yield TOKENS[TokenType.EOF];
      return;
    }

    const sublexer: SubLexer | undefined = SUBLEXER[state]?.[la];
    if (!sublexer) {
      throw unexpectedChar(la);
    }

    const [token, newLa] = sublexer(la, it);
    la = newLa;
    state = token.type === TokenType.COLON ? STATE[token.type] : State.DEFAULT;
    yield token;
  }
}

const TOKENS: Record<TokenType, Token> = {
  [TokenType.EOF]: { text: "", type: TokenType.EOF },
  [TokenType.LPAREN]: { text: "(", type: TokenType.LPAREN },
  [TokenType.RPAREN]: { text: ")", type: TokenType.RPAREN },
  [TokenType.COMMA]: { text: ",", type: TokenType.COMMA },
  [TokenType.COLON]: { text: ":", type: TokenType.COLON },
  [TokenType.KSEQ]: { text: "~>", type: TokenType.KSEQ },
  [TokenType.DOTK]: { text: ".K", type: TokenType.DOTK },
  [TokenType.DOTKLIST]: { text: ".KList", type: TokenType.DOTKLIST },
  [TokenType.TOKEN]: { text: "#token", type: TokenType.TOKEN },
  [TokenType.ID]: { text: "", type: TokenType.ID },
  [TokenType.VARIABLE]: { text: "", type: TokenType.VARIABLE },
  [TokenType.SORT]: { text: "", type: TokenType.SORT },
  [TokenType.KLABEL]: { text: "", type: TokenType.KLABEL },
  [TokenType.STRING]: { text: "", type: TokenType.STRING },
};

const DIGIT = new Set("0123456789");
const LOWER = new Set("abcdefghijklmnopqrstuvwxyz");
const UPPER = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
const ALNUM = new Set([...DIGIT, ...LOWER, ...UPPER]);

const UNEXPECTED_EOF = new Error("Unexpected end of file");

function unexpectedChar(actual: string, expected?: string): Error {
  if (expected === undefined) {
    return new Error(`Unexpected character: ${JSON.stringify(actual)}`);
  }
  const actualStr = actual ? JSON.stringify(actual) : "<EOF>";
  return new Error(`Expected ${JSON.stringify(expected)}, got: ${actualStr}`);
}

type SubLexer = (la: string, it: Iterator<string>) => [Token, string];

function simple(token: Token): SubLexer {
  return (la: string, it: Iterator<string>): [Token, string] => {
    const newLa = it.next().value || "";
    return [token, newLa];
  };
}

function delimited(delimiter: string, type: TokenType): SubLexer {
  return (la: string, it: Iterator<string>): [Token, string] => {
    const buf: string[] = [la];
    let newLa = it.next().value || "";

    while (true) {
      if (!newLa) {
        throw UNEXPECTED_EOF;
      }

      if (newLa === delimiter) {
        buf.push(newLa);
        newLa = it.next().value || "";
        return [{ text: buf.join(""), type }, newLa];
      }

      if (newLa === "\\") {
        buf.push(newLa);
        newLa = it.next().value || "";
        if (!newLa) {
          throw UNEXPECTED_EOF;
        }
        buf.push(newLa);
        newLa = it.next().value || "";
      } else {
        buf.push(newLa);
        newLa = it.next().value || "";
      }
    }
  };
}

function kseq(la: string, it: Iterator<string>): [Token, string] {
  let newLa = it.next().value || "";
  if (newLa !== ">") {
    throw unexpectedChar(newLa, ">");
  }
  newLa = it.next().value || "";
  return [TOKENS[TokenType.KSEQ], newLa];
}

const ID_CHARS = new Set([...LOWER, ...UPPER, ...DIGIT]);

function idOrToken(la: string, it: Iterator<string>): [Token, string] {
  const buf: string[] = [la];
  let newLa = it.next().value || "";

  while (newLa && ID_CHARS.has(newLa)) {
    buf.push(newLa);
    newLa = it.next().value || "";
  }

  const text = buf.join("");
  if (text === "#token") {
    return [TOKENS[TokenType.TOKEN], newLa];
  }
  return [{ text, type: TokenType.ID }, newLa];
}

const VARIABLE_CHARS = new Set([...LOWER, ...UPPER, ...DIGIT, "'", "_"]);

function variable(la: string, it: Iterator<string>): [Token, string] {
  let state: number;
  if (la === "?") {
    state = 0;
  } else if (la === "_") {
    state = 1;
  } else if (UPPER.has(la)) {
    state = 2;
  } else {
    throw unexpectedChar(la);
  }

  const buf: string[] = [la];
  let newLa = it.next().value || "";

  if (state === 0) {
    if (newLa === "_") {
      state = 1;
    } else if (newLa && UPPER.has(newLa)) {
      state = 2;
    } else {
      throw unexpectedChar(newLa);
    }
    buf.push(newLa);
    newLa = it.next().value || "";
  }

  if (state === 1) {
    if (newLa && UPPER.has(newLa)) {
      buf.push(newLa);
      newLa = it.next().value || "";
      state = 2;
    } else {
      const text = buf.join("");
      return [{ text, type: TokenType.VARIABLE }, newLa];
    }
  }

  // state === 2
  while (newLa && VARIABLE_CHARS.has(newLa)) {
    buf.push(newLa);
    newLa = it.next().value || "";
  }

  const text = buf.join("");
  return [{ text, type: TokenType.VARIABLE }, newLa];
}

const SEP = new Set([
  ",",
  ":",
  "(",
  ")",
  "`",
  '"',
  "#",
  ".",
  "~",
  " ",
  "\t",
  "\r",
  "\n",
  "",
]);

function dotkOrDotklist(la: string, it: Iterator<string>): [Token, string] {
  let newLa = it.next().value || "";
  if (newLa !== "K") {
    throw unexpectedChar(newLa, "K");
  }
  newLa = it.next().value || "";

  if (SEP.has(newLa)) {
    return [TOKENS[TokenType.DOTK], newLa];
  }

  for (const c of "List") {
    if (newLa !== c) {
      throw unexpectedChar(newLa, c);
    }
    newLa = it.next().value || "";
  }

  if (SEP.has(newLa)) {
    return [TOKENS[TokenType.DOTKLIST], newLa];
  }

  throw unexpectedChar(newLa);
}

function sort(la: string, it: Iterator<string>): [Token, string] {
  const buf: string[] = [la];
  let newLa = it.next().value || "";

  while (newLa && ALNUM.has(newLa)) {
    buf.push(newLa);
    newLa = it.next().value || "";
  }

  const text = buf.join("");
  return [{ text, type: TokenType.SORT }, newLa];
}

const SUBLEXER: Record<State, Record<string, SubLexer>> = {
  [State.DEFAULT]: {
    "(": simple(TOKENS[TokenType.LPAREN]),
    ")": simple(TOKENS[TokenType.RPAREN]),
    ",": simple(TOKENS[TokenType.COMMA]),
    ":": simple(TOKENS[TokenType.COLON]),
    '"': delimited('"', TokenType.STRING),
    "`": delimited("`", TokenType.KLABEL),
    "~": kseq,
    ".": dotkOrDotklist,
    ...Object.fromEntries(
      [...Array.from("#").concat(Array.from(LOWER))].map((c) => [c, idOrToken])
    ),
    ...Object.fromEntries(
      ["?", "_", ...Array.from(UPPER)].map((c) => [c, variable])
    ),
  },
  [State.SORT]: Object.fromEntries(Array.from(UPPER).map((c) => [c, sort])),
};

const STATE = {
  [TokenType.COLON]: State.SORT,
};
