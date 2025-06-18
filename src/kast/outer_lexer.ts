export enum TokenType {
  EOF = 0,
  COMMA,
  LPAREN,
  RPAREN,
  LBRACE,
  RBRACE,
  LBRACK,
  RBRACK,
  VBAR,
  EQ,
  GT,
  PLUS,
  TIMES,
  QUESTION,
  TILDE,
  COLON,
  DCOLONEQ,
  KW_ALIAS,
  KW_CLAIM,
  KW_CONFIG,
  KW_CONTEXT,
  KW_ENDMODULE,
  KW_IMPORTS,
  KW_LEFT,
  KW_LEXICAL,
  KW_MODULE,
  KW_NONASSOC,
  KW_PRIORITY,
  KW_PRIVATE,
  KW_PUBLIC,
  KW_REQUIRES,
  KW_RIGHT,
  KW_RULE,
  KW_SYNTAX,
  NAT,
  STRING,
  REGEX,
  ID_LOWER,
  ID_UPPER,
  MODNAME,
  KLABEL,
  RULE_LABEL,
  ATTR_KEY,
  ATTR_CONTENT,
  BUBBLE,
}

export class Loc {
  constructor(public line: number, public col: number) {}

  add(other: string): Loc {
    let line = this.line;
    let col = this.col;
    for (const c of other) {
      if (c === "\n") {
        line += 1;
        col = 0;
      }
      col += 1;
    }
    return new Loc(line, col);
  }
}

export const INIT_LOC = new Loc(1, 0);

export class Token {
  constructor(public text: string, public type: TokenType, public loc: Loc) {}

  let(options: { text?: string; type?: TokenType; loc?: Loc }): Token {
    return new Token(
      options.text ?? this.text,
      options.type ?? this.type,
      options.loc ?? this.loc
    );
  }
}

const EOF_TOKEN = new Token("", TokenType.EOF, INIT_LOC);

const SIMPLE_CHARS: Record<string, TokenType> = {
  ",": TokenType.COMMA,
  "(": TokenType.LPAREN,
  ")": TokenType.RPAREN,
  "[": TokenType.LBRACK,
  "]": TokenType.RBRACK,
  ">": TokenType.GT,
  "{": TokenType.LBRACE,
  "}": TokenType.RBRACE,
  "|": TokenType.VBAR,
  "=": TokenType.EQ,
  "+": TokenType.PLUS,
  "*": TokenType.TIMES,
  "?": TokenType.QUESTION,
  "~": TokenType.TILDE,
};

const KEYWORDS: Record<string, TokenType> = {
  alias: TokenType.KW_ALIAS,
  claim: TokenType.KW_CLAIM,
  configuration: TokenType.KW_CONFIG,
  context: TokenType.KW_CONTEXT,
  endmodule: TokenType.KW_ENDMODULE,
  imports: TokenType.KW_IMPORTS,
  left: TokenType.KW_LEFT,
  lexical: TokenType.KW_LEXICAL,
  module: TokenType.KW_MODULE,
  "non-assoc": TokenType.KW_NONASSOC,
  priority: TokenType.KW_PRIORITY,
  private: TokenType.KW_PRIVATE,
  public: TokenType.KW_PUBLIC,
  requires: TokenType.KW_REQUIRES,
  right: TokenType.KW_RIGHT,
  rule: TokenType.KW_RULE,
  syntax: TokenType.KW_SYNTAX,
};

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);
const DIGIT = new Set("0123456789");
const LOWER = new Set("abcdefghijklmnopqrstuvwxyz");
const UPPER = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
const ALPHA = new Set([...LOWER, ...UPPER]);
const ALNUM = new Set([...ALPHA, ...DIGIT]);
const WORD = new Set(["_", ...ALNUM]);

enum State {
  DEFAULT,
  SYNTAX,
  KLABEL,
  BUBBLE,
  CONTEXT,
  ATTR,
  MODNAME,
}

const NEXT_STATE: Record<string, State> = {
  [`${State.BUBBLE},${TokenType.KW_CLAIM}`]: State.BUBBLE,
  [`${State.BUBBLE},${TokenType.KW_CONFIG}`]: State.BUBBLE,
  [`${State.BUBBLE},${TokenType.KW_CONTEXT}`]: State.CONTEXT,
  [`${State.BUBBLE},${TokenType.KW_ENDMODULE}`]: State.DEFAULT,
  [`${State.BUBBLE},${TokenType.KW_RULE}`]: State.BUBBLE,
  [`${State.BUBBLE},${TokenType.KW_SYNTAX}`]: State.SYNTAX,
  [`${State.CONTEXT},${TokenType.KW_ALIAS}`]: State.BUBBLE,
  [`${State.CONTEXT},${TokenType.KW_CLAIM}`]: State.BUBBLE,
  [`${State.CONTEXT},${TokenType.KW_CONFIG}`]: State.BUBBLE,
  [`${State.CONTEXT},${TokenType.KW_CONTEXT}`]: State.CONTEXT,
  [`${State.CONTEXT},${TokenType.KW_ENDMODULE}`]: State.DEFAULT,
  [`${State.CONTEXT},${TokenType.KW_RULE}`]: State.BUBBLE,
  [`${State.CONTEXT},${TokenType.KW_SYNTAX}`]: State.SYNTAX,
  [`${State.DEFAULT},${TokenType.KW_CLAIM}`]: State.BUBBLE,
  [`${State.DEFAULT},${TokenType.KW_CONFIG}`]: State.BUBBLE,
  [`${State.DEFAULT},${TokenType.KW_CONTEXT}`]: State.CONTEXT,
  [`${State.DEFAULT},${TokenType.KW_IMPORTS}`]: State.MODNAME,
  [`${State.DEFAULT},${TokenType.KW_MODULE}`]: State.MODNAME,
  [`${State.DEFAULT},${TokenType.KW_RULE}`]: State.BUBBLE,
  [`${State.DEFAULT},${TokenType.KW_SYNTAX}`]: State.SYNTAX,
  [`${State.DEFAULT},${TokenType.LBRACK}`]: State.ATTR,
  [`${State.KLABEL},${TokenType.KW_CLAIM}`]: State.BUBBLE,
  [`${State.KLABEL},${TokenType.KW_CONFIG}`]: State.BUBBLE,
  [`${State.KLABEL},${TokenType.KW_CONTEXT}`]: State.CONTEXT,
  [`${State.KLABEL},${TokenType.KW_ENDMODULE}`]: State.DEFAULT,
  [`${State.KLABEL},${TokenType.KW_RULE}`]: State.BUBBLE,
  [`${State.KLABEL},${TokenType.KW_SYNTAX}`]: State.SYNTAX,
  [`${State.MODNAME},${TokenType.MODNAME}`]: State.DEFAULT,
  [`${State.SYNTAX},${TokenType.ID_UPPER}`]: State.DEFAULT,
  [`${State.SYNTAX},${TokenType.KW_LEFT}`]: State.KLABEL,
  [`${State.SYNTAX},${TokenType.KW_LEXICAL}`]: State.DEFAULT,
  [`${State.SYNTAX},${TokenType.KW_NONASSOC}`]: State.KLABEL,
  [`${State.SYNTAX},${TokenType.KW_PRIORITY}`]: State.KLABEL,
  [`${State.SYNTAX},${TokenType.KW_RIGHT}`]: State.KLABEL,
  [`${State.SYNTAX},${TokenType.LBRACE}`]: State.DEFAULT,
};

const BUBBLY_STATES = new Set([State.BUBBLE, State.CONTEXT]);

export class LocationIterator implements Iterator<string> {
  private line: number;
  private col: number;
  private iter: Iterator<string>;
  private nextline: boolean;

  constructor(text: Iterable<string>, line: number = 1, col: number = 0) {
    this.iter = text[Symbol.iterator]();
    this.line = line;
    this.col = col;
    this.nextline = false;
  }

  next(): IteratorResult<string> {
    const result = this.iter.next();
    if (result.done) {
      return result;
    }

    const la = result.value;
    this.col += 1;
    if (this.nextline) {
      this.line += 1;
      this.col = 1;
    }
    this.nextline = la === "\n";
    return result;
  }

  get loc(): Loc {
    return new Loc(this.line, this.col);
  }

  [Symbol.iterator](): Iterator<string> {
    return this;
  }
}

export function* outerLexer(text: Iterable<string>): Generator<Token> {
  const it = new LocationIterator(text);
  let result = it.next();
  let la = result.done ? "" : result.value;
  let state = State.DEFAULT;

  while (true) {
    if (SIMPLE_STATES.has(state)) {
      const [token, newLa] = SIMPLE_STATES.get(state)!(la, it);
      yield token;
      const lastToken = token;
      la = newLa;

      if (lastToken.type === TokenType.EOF) {
        return;
      }
      const stateKey = `${state},${lastToken.type}`;
      state = NEXT_STATE[stateKey] ?? state;
    } else if (BUBBLY_STATES.has(state)) {
      const [tokens, newLa] = bubbleOrContext(la, it, state === State.CONTEXT);
      yield* tokens;
      const lastToken = tokens[tokens.length - 1];
      la = newLa;

      if (lastToken.type === TokenType.EOF) {
        return;
      }
      const stateKey = `${state},${lastToken.type}`;
      state = NEXT_STATE[stateKey] ?? state;
    } else if (state === State.ATTR) {
      const attrGen = attr(la, it);
      let attrResult = attrGen.next();
      while (!attrResult.done) {
        yield attrResult.value;
        attrResult = attrGen.next();
      }
      la = attrResult.value;
      state = State.DEFAULT;
    } else {
      throw new Error(`Invalid state: ${state}`);
    }
  }
}

const DEFAULT_KEYWORDS = new Set([
  "claim",
  "configuration",
  "context",
  "endmodule",
  "import",
  "imports",
  "left",
  "module",
  "non-assoc",
  "require",
  "requires",
  "right",
  "rule",
  "syntax",
]);

function defaultLexer(la: string, it: LocationIterator): [Token, string] {
  la = skipWsAndComments(la, it);

  if (!la) {
    return [new Token("", TokenType.EOF, it.loc), la];
  }

  let tokenFunc: (
    la: string,
    it: LocationIterator
  ) => [string, TokenType, string];

  if (la in SIMPLE_CHARS) {
    tokenFunc = simpleChar;
  } else if (la === '"') {
    tokenFunc = stringToken;
  } else if (la === "r") {
    tokenFunc = regexOrLowerIdOrKeyword;
  } else if (DIGIT.has(la)) {
    tokenFunc = nat;
  } else if (ALNUM.has(la)) {
    tokenFunc = idOrKeyword;
  } else if (la === "#") {
    tokenFunc = hashId;
  } else if (la === ":") {
    tokenFunc = colonOrDcoloneq;
  } else {
    throw unexpectedCharacter(la);
  }

  const loc = it.loc;
  const [text, tokenType, newLa] = tokenFunc(la, it);
  return [new Token(text, tokenType, loc), newLa];
}

function skipWsAndComments(la: string, it: Iterator<string>): string {
  while (true) {
    if (WHITESPACE.has(la)) {
      const result = it.next();
      la = result.done ? "" : result.value;
    } else if (la === "/") {
      const [isComment, consumed, newLa] = maybeComment(la, it);
      if (!isComment) {
        throw unexpectedCharacter(la);
      }
      const result = it.next();
      la = result.done ? "" : result.value;
    } else {
      break;
    }
  }
  return la;
}

function simpleChar(
  la: string,
  it: Iterator<string>
): [string, TokenType, string] {
  const text = la;
  const tokenType = SIMPLE_CHARS[la];
  const result = it.next();
  const newLa = result.done ? "" : result.value;
  return [text, tokenType, newLa];
}

function nat(la: string, it: Iterator<string>): [string, TokenType, string] {
  const consumed: string[] = [];
  while (DIGIT.has(la)) {
    consumed.push(la);
    const result = it.next();
    la = result.done ? "" : result.value;
  }
  const text = consumed.join("");
  return [text, TokenType.NAT, la];
}

function idOrKeyword(
  la: string,
  it: Iterator<string>
): [string, TokenType, string] {
  let tokenType = LOWER.has(la) ? TokenType.ID_LOWER : TokenType.ID_UPPER;

  const consumed: string[] = [];
  while (ALNUM.has(la) || la === "-") {
    consumed.push(la);
    const result = it.next();
    la = result.done ? "" : result.value;
  }
  const text = consumed.join("");
  if (DEFAULT_KEYWORDS.has(text)) {
    return [text, KEYWORDS[text], la];
  }
  return [text, tokenType, la];
}

function hashId(la: string, it: Iterator<string>): [string, TokenType, string] {
  const consumed: string[] = [la];
  let result = it.next();
  la = result.done ? "" : result.value;

  let tokenType: TokenType;
  if (LOWER.has(la)) {
    tokenType = TokenType.ID_LOWER;
  } else if (UPPER.has(la)) {
    tokenType = TokenType.ID_UPPER;
  } else {
    throw unexpectedCharacter(la);
  }

  while (ALNUM.has(la)) {
    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;
  }
  const text = consumed.join("");
  return [text, tokenType, la];
}

function colonOrDcoloneq(
  la: string,
  it: Iterator<string>
): [string, TokenType, string] {
  let result = it.next();
  la = result.done ? "" : result.value;
  if (la !== ":") {
    return [":", TokenType.COLON, la];
  }
  result = it.next();
  la = result.done ? "" : result.value;
  if (la !== "=") {
    throw unexpectedCharacter(la);
  }
  result = it.next();
  la = result.done ? "" : result.value;
  return ["::=", TokenType.DCOLONEQ, la];
}

function stringToken(
  la: string,
  it: Iterator<string>
): [string, TokenType, string] {
  const consumed: string[] = [];
  la = consumeString(consumed, la, it);
  return [consumed.join(""), TokenType.STRING, la];
}

function regexOrLowerIdOrKeyword(
  la: string,
  it: Iterator<string>
): [string, TokenType, string] {
  const consumed: string[] = [la];
  let result = it.next();
  la = result.done ? "" : result.value;

  if (la === '"') {
    la = consumeString(consumed, la, it);
    return [consumed.join(""), TokenType.REGEX, la];
  }

  while (ALNUM.has(la)) {
    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;
  }
  const text = consumed.join("");
  if (DEFAULT_KEYWORDS.has(text)) {
    return [text, KEYWORDS[text], la];
  }
  return [text, TokenType.ID_LOWER, la];
}

function consumeString(
  consumed: string[],
  la: string,
  it: Iterator<string>
): string {
  consumed.push(la); // ['"']

  let result = it.next();
  la = result.done ? "" : result.value;
  while (la !== '"' && la !== "\n" && la !== "") {
    consumed.push(la);
    if (la === "\\") {
      result = it.next();
      la = result.done ? "" : result.value;
      if (!la || !["\\", '"', "n", "r", "t"].includes(la)) {
        throw unexpectedCharacter(la);
      }
      consumed.push(la);
    }
    result = it.next();
    la = result.done ? "" : result.value;
  }

  if (!la || la === "\n") {
    throw unexpectedCharacter(la);
  }

  consumed.push(la); // ['"', ..., '"']
  result = it.next();
  la = result.done ? "" : result.value;
  return la;
}

const SYNTAX_KEYWORDS = new Set([
  "left",
  "lexical",
  "non-assoc",
  "priorities",
  "priority",
  "right",
]);

function syntaxLexer(la: string, it: LocationIterator): [Token, string] {
  la = skipWsAndComments(la, it);

  if (!la) {
    return [new Token("", TokenType.EOF, it.loc), la];
  }

  let tokenFunc: (
    la: string,
    it: Iterator<string>
  ) => [string, TokenType, string];

  if (la === "{") {
    tokenFunc = simpleChar;
  } else if (LOWER.has(la)) {
    tokenFunc = syntaxKeyword;
  } else if (UPPER.has(la)) {
    tokenFunc = upperId;
  } else if (la === "#") {
    tokenFunc = hashUpperId;
  } else {
    throw unexpectedCharacter(la);
  }

  const loc = it.loc;
  const [text, tokenType, newLa] = tokenFunc(la, it);
  return [new Token(text, tokenType, loc), newLa];
}

function syntaxKeyword(
  la: string,
  it: Iterator<string>
): [string, TokenType, string] {
  if (!LOWER.has(la)) {
    throw unexpectedCharacter(la);
  }

  const consumed: string[] = [];
  while (ALNUM.has(la) || la === "-") {
    consumed.push(la);
    const result = it.next();
    la = result.done ? "" : result.value;
  }
  const text = consumed.join("");

  if (!SYNTAX_KEYWORDS.has(text)) {
    throw new Error(`Unexpected token: ${text}`);
  }

  return [text, KEYWORDS[text], la];
}

function upperId(
  la: string,
  it: Iterator<string>
): [string, TokenType, string] {
  if (!UPPER.has(la)) {
    throw unexpectedCharacter(la);
  }

  const consumed: string[] = [];
  while (ALNUM.has(la)) {
    consumed.push(la);
    const result = it.next();
    la = result.done ? "" : result.value;
  }
  const text = consumed.join("");
  return [text, TokenType.ID_UPPER, la];
}

function hashUpperId(
  la: string,
  it: Iterator<string>
): [string, TokenType, string] {
  const consumed: string[] = [la];
  let result = it.next();
  la = result.done ? "" : result.value;

  if (!UPPER.has(la)) {
    throw unexpectedCharacter(la);
  }

  while (ALNUM.has(la)) {
    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;
  }
  const text = consumed.join("");
  return [text, TokenType.ID_UPPER, la];
}

const MODNAME_KEYWORDS = new Set(["private", "public"]);

function modnameLexer(la: string, it: LocationIterator): [Token, string] {
  la = skipWsAndComments(la, it);

  const consumed: string[] = [];
  const loc = it.loc;

  if (!ALPHA.has(la)) {
    throw unexpectedCharacter(la);
  }

  consumed.push(la);
  let result = it.next();
  la = result.done ? "" : result.value;

  while (WORD.has(la)) {
    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;
  }

  while (true) {
    if (la !== "-") {
      break;
    }

    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;

    if (!WORD.has(la)) {
      throw unexpectedCharacter(la);
    }

    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;

    while (WORD.has(la)) {
      consumed.push(la);
      result = it.next();
      la = result.done ? "" : result.value;
    }
  }

  const text = consumed.join("");
  if (MODNAME_KEYWORDS.has(text)) {
    return [new Token(text, KEYWORDS[text], loc), la];
  }
  return [new Token(text, TokenType.MODNAME, loc), la];
}

const KLABEL_KEYWORDS = new Set([
  "syntax",
  "endmodule",
  "rule",
  "claim",
  "configuration",
  "context",
]);

function klabelLexer(la: string, it: LocationIterator): [Token, string] {
  let loc: Loc;
  let consumed: string[];

  while (true) {
    while (WHITESPACE.has(la)) {
      const result = it.next();
      la = result.done ? "" : result.value;
    }

    if (!la) {
      return [new Token("", TokenType.EOF, it.loc), la];
    }

    if (la === "/") {
      loc = it.loc;
      const [isComment, commentConsumed, newLa] = maybeComment(la, it);

      if (!isComment && commentConsumed.length > 1) {
        throw new Error("Unterminated block comment");
      }

      if (isComment && (!newLa || WHITESPACE.has(newLa))) {
        la = newLa;
        continue;
      }

      consumed = commentConsumed;
      la = newLa;
      break;
    }

    loc = it.loc;
    consumed = [];
    break;
  }

  if (la === ">" && consumed.length === 0) {
    consumed.push(la);
    const result = it.next();
    la = result.done ? "" : result.value;
    if (!la || WHITESPACE.has(la)) {
      return [new Token(">", TokenType.GT, loc), la];
    }
  }

  while (la && !WHITESPACE.has(la)) {
    consumed.push(la);
    const result = it.next();
    la = result.done ? "" : result.value;
  }

  const text = consumed.join("");
  const tokenType = KLABEL_KEYWORDS.has(text)
    ? KEYWORDS[text]
    : TokenType.KLABEL;
  return [new Token(text, tokenType, loc), la];
}

const SIMPLE_STATES = new Map<
  State,
  (la: string, it: LocationIterator) => [Token, string]
>([
  [State.DEFAULT, defaultLexer],
  [State.SYNTAX, syntaxLexer],
  [State.MODNAME, modnameLexer],
  [State.KLABEL, klabelLexer],
]);

const BUBBLE_KEYWORDS = new Set([
  "syntax",
  "endmodule",
  "rule",
  "claim",
  "configuration",
  "context",
]);
const CONTEXT_KEYWORDS = new Set(["alias", ...BUBBLE_KEYWORDS]);

function bubbleOrContext(
  la: string,
  it: LocationIterator,
  context: boolean = false
): [Token[], string] {
  const keywords = context ? CONTEXT_KEYWORDS : BUBBLE_KEYWORDS;

  const tokens: Token[] = [];

  const [bubble, finalToken, newLa, bubbleLoc] = rawBubble(la, it, keywords);
  if (bubble !== null) {
    const [labelTokens, strippedBubble, strippedLoc] = stripBubbleLabel(
      bubble,
      bubbleLoc
    );
    const [finalBubble, attrTokens] = stripBubbleAttr(
      strippedBubble,
      strippedLoc
    );

    tokens.push(...labelTokens);
    if (finalBubble) {
      const bubbleToken = new Token(finalBubble, TokenType.BUBBLE, strippedLoc);
      tokens.push(bubbleToken);
    }
    tokens.push(...attrTokens);
  }

  tokens.push(finalToken);
  return [tokens, newLa];
}

function rawBubble(
  la: string,
  it: LocationIterator,
  keywords: Set<string>
): [string | null, Token, string, Loc] {
  const bubble: string[] = [];
  const special: string[] = [];
  const current: string[] = [];
  let bubbleLoc: Loc = it.loc;
  let currentLoc: Loc = it.loc;

  while (true) {
    if (!la || WHITESPACE.has(la)) {
      if (current.length > 0) {
        const currentStr = current.join("");
        if (keywords.has(currentStr)) {
          return [
            bubble.length > 0 ? bubble.join("") : null,
            new Token(currentStr, KEYWORDS[currentStr], currentLoc),
            la,
            bubbleLoc,
          ];
        } else {
          if (bubble.length === 0) {
            bubbleLoc = bubbleLoc.add(special.join(""));
          }
          if (bubble.length > 0) {
            bubble.push(...special);
          }
          bubble.push(...current);
          special.length = 0;
          current.length = 0;
          currentLoc = it.loc;
        }
      }

      while (WHITESPACE.has(la)) {
        special.push(la);
        const result = it.next();
        la = result.done ? "" : result.value;
        currentLoc = it.loc;
      }

      if (!la) {
        return [
          bubble.length > 0 ? bubble.join("") : null,
          new Token("", TokenType.EOF, it.loc),
          la,
          bubbleLoc,
        ];
      }
    } else if (la === "/") {
      const [isComment, consumed, newLa] = maybeComment(la, it);
      if (isComment) {
        if (current.length > 0) {
          const currentStr = current.join("");
          if (keywords.has(currentStr)) {
            return [
              bubble.length > 0 ? bubble.join("") : null,
              new Token(currentStr, KEYWORDS[currentStr], currentLoc),
              newLa,
              bubbleLoc,
            ];
          } else {
            if (bubble.length === 0) {
              bubbleLoc = bubbleLoc.add(special.join(""));
            }
            if (bubble.length > 0) {
              bubble.push(...special);
            }
            bubble.push(...current);
            special.length = 0;
            special.push(...consumed);
            current.length = 0;
            currentLoc = it.loc;
          }
        } else {
          special.push(...consumed);
        }
        la = newLa;
      } else {
        if (consumed.length > 1) {
          throw new Error("Unterminated block comment");
        }
        current.push(...consumed);
        la = newLa;
      }
    } else {
      while (la && !WHITESPACE.has(la) && la !== "/") {
        current.push(la);
        const result = it.next();
        la = result.done ? "" : result.value;
      }
    }
  }
}

const RULE_LABEL_PATTERN =
  /(?s)\s*(?<lbrack>\[)\s*(?<label>[^\[\]\_\n\r\t ]+)\s*(?<rbrack>\])\s*(?<colon>:)\s*(?<rest>.*)/s;

function stripBubbleLabel(bubble: string, loc: Loc): [Token[], string, Loc] {
  const match = bubble.match(RULE_LABEL_PATTERN);
  if (!match || !match.groups) {
    return [[], bubble, loc];
  }

  const groups = match.groups;
  const lbrackIndex = bubble.indexOf(groups.lbrack);
  const labelIndex = bubble.indexOf(groups.label);
  const rbrackIndex = bubble.indexOf(groups.rbrack);
  const colonIndex = bubble.indexOf(groups.colon);
  const restIndex = bubble.indexOf(groups.rest);

  const lbrackLoc = loc.add(bubble.substring(0, lbrackIndex));
  const labelLoc = lbrackLoc.add(bubble.substring(lbrackIndex, labelIndex));
  const rbrackLoc = labelLoc.add(bubble.substring(labelIndex, rbrackIndex));
  const colonLoc = rbrackLoc.add(bubble.substring(rbrackIndex, colonIndex));

  return [
    [
      new Token("[", TokenType.LBRACK, lbrackLoc),
      new Token(groups.label, TokenType.RULE_LABEL, labelLoc),
      new Token("]", TokenType.RBRACK, rbrackLoc),
      new Token(":", TokenType.COLON, colonLoc),
    ],
    groups.rest,
    colonLoc.add(bubble.substring(colonIndex, restIndex)),
  ];
}

function stripBubbleAttr(bubble: string, loc: Loc): [string, Token[]] {
  for (let i = bubble.length - 1; i >= 0; i--) {
    if (bubble[i] !== "[") {
      continue;
    }

    const prefix = bubble.substring(0, i);
    const suffix = bubble.substring(i + 1);
    const startLoc = loc.add(prefix);

    const it = new LocationIterator(suffix, startLoc.line, startLoc.col);
    let result = it.next();
    let la = result.done ? "" : result.value;

    const tokens = [new Token("[", TokenType.LBRACK, startLoc)];
    const attrGen = attr(la, it);
    try {
      let attrResult = attrGen.next();
      while (!attrResult.done) {
        tokens.push(attrResult.value);
        attrResult = attrGen.next();
      }
      la = attrResult.value;
    } catch (error) {
      continue;
    }

    if (la) {
      continue;
    }

    return [prefix.replace(/[ \t\n\r]+$/, ""), tokens];
  }

  return [bubble, []];
}

function* attr(la: string, it: LocationIterator): Generator<Token, string> {
  la = skipWsAndComments(la, it);
  if (!la) {
    throw unexpectedCharacter(la);
  }

  while (true) {
    const [key, newLa] = attrKey(la, it);
    yield key;
    la = newLa;

    la = skipWsAndComments(la, it);

    if (la === "(") {
      yield new Token("(", TokenType.LPAREN, it.loc);
      let result = it.next();
      la = result.done ? "" : result.value;
      const loc = it.loc;

      if (la === '"') {
        const [text, tokenType, stringLa] = stringToken(la, it);
        yield new Token(text, tokenType, loc);
        la = stringLa;
      } else {
        const [content, contentLa] = attrContent(la, it);
        if (content) {
          yield new Token(content, TokenType.ATTR_CONTENT, loc);
        }
        la = contentLa;
      }

      if (la !== ")") {
        throw unexpectedCharacter(la);
      }

      yield new Token(")", TokenType.RPAREN, it.loc);

      result = it.next();
      la = result.done ? "" : result.value;
      la = skipWsAndComments(la, it);
    }

    if (la !== ",") {
      break;
    }

    yield new Token(",", TokenType.COMMA, it.loc);
    let result = it.next();
    la = result.done ? "" : result.value;
    la = skipWsAndComments(la, it);
  }

  if (la !== "]") {
    throw unexpectedCharacter(la);
  }

  yield new Token("]", TokenType.RBRACK, it.loc);
  const result = it.next();
  la = result.done ? "" : result.value;

  return la;
}

function attrKey(la: string, it: LocationIterator): [Token, string] {
  const consumed: string[] = [];
  const loc = it.loc;
  if (!LOWER.has(la) && !DIGIT.has(la)) {
    throw unexpectedCharacter(la);
  }

  consumed.push(la);
  let result = it.next();
  la = result.done ? "" : result.value;

  while (ALNUM.has(la) || la === "-" || la === ".") {
    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;
  }

  if (la === "<") {
    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;

    if (!ALNUM.has(la) && la !== "-" && la !== ".") {
      throw unexpectedCharacter(la);
    }

    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;

    while (ALNUM.has(la) || la === "-" || la === ".") {
      consumed.push(la);
      result = it.next();
      la = result.done ? "" : result.value;
    }

    if (la !== ">") {
      throw unexpectedCharacter(la);
    }

    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;
  }

  const attrKey = consumed.join("");
  return [new Token(attrKey, TokenType.ATTR_KEY, loc), la];
}

const ATTR_CONTENT_FORBIDDEN = new Set(["", "\n", "\r", '"']);

function attrContent(la: string, it: Iterator<string>): [string, string] {
  const consumed: string[] = [];
  let openParens = 0;

  while (!ATTR_CONTENT_FORBIDDEN.has(la)) {
    if (la === ")") {
      if (!openParens) {
        break;
      }
      openParens -= 1;
    } else if (la === "(") {
      openParens += 1;
    }

    consumed.push(la);
    const result = it.next();
    la = result.done ? "" : result.value;
  }

  if (ATTR_CONTENT_FORBIDDEN.has(la)) {
    throw unexpectedCharacter(la);
  }

  const attrContent = consumed.join("");
  return [attrContent, la];
}

function maybeComment(
  la: string,
  it: Iterator<string>
): [boolean, string[], string] {
  const consumed: string[] = [la];

  let result = it.next();
  la = result.done ? "" : result.value;
  if (la === "") {
    return [false, consumed, la];
  }

  if (la === "/") {
    consumed.push(la);
    result = it.next();
    la = result.done ? "" : result.value;
    while (la && la !== "\n") {
      consumed.push(la);
      result = it.next();
      la = result.done ? "" : result.value;
    }
    return [true, consumed, la];
  }

  if (la === "*") {
    consumed.push(la);

    result = it.next();
    la = result.done ? "" : result.value;
    while (true) {
      if (la === "") {
        return [false, consumed, la];
      }

      if (la === "*") {
        consumed.push(la);

        result = it.next();
        la = result.done ? "" : result.value;
        if (la === "") {
          return [false, consumed, la];
        } else if (la === "/") {
          consumed.push(la);
          result = it.next();
          la = result.done ? "" : result.value;
          return [true, consumed, la];
        } else {
          consumed.push(la);
          result = it.next();
          la = result.done ? "" : result.value;
          continue;
        }
      } else {
        consumed.push(la);
        result = it.next();
        la = result.done ? "" : result.value;
        continue;
      }
    }
  }

  return [false, consumed, la];
}

function unexpectedCharacter(la: string): Error {
  if (la) {
    return new Error(`Unexpected character: ${JSON.stringify(la)}`);
  }
  return new Error("Unexpected end of file");
}
