export function selectCodeBlocks(text: string, selector?: string): string {
  const _selector = selector ? new SelectorParser(selector).parse() : null;

  function selected(codeBlock: CodeBlock): boolean {
    if (_selector === null) {
      return true;
    }

    const tags = parseTags(codeBlock.info);
    return _selector.eval(tags);
  }

  // TODO: Preserve line numbers from input text
  return Array.from(codeBlocks(text))
    .filter(selected)
    .map((block) => block.code)
    .join("\n");
}

export interface CodeBlock {
  info: string;
  code: string;
}

const CODE_BLOCK_PATTERN =
  /(^|(?<=\n)) {0,3}(?<fence>```+)(?!`)(?<info>.*)\n(?<code>(?:.*\n)*?) {0,3}\k<fence>`*/g;

export function* codeBlocks(text: string): Generator<CodeBlock> {
  let match: RegExpExecArray | null;
  while ((match = CODE_BLOCK_PATTERN.exec(text)) !== null) {
    const info = match.groups!.info!;
    const code = match.groups!.code!.replace(/\n$/, "");
    yield { info, code };
  }
}

export function parseTags(text: string): Set<string> {
  function checkTag(tag: string): void {
    if (!tag || !Array.from(tag).every((c) => /[\w-]/.test(c))) {
      throw new Error(`Invalid tag: ${JSON.stringify(tag)}`);
    }
  }

  if (!text) {
    return new Set();
  }

  if (text[0] !== "{") {
    checkTag(text);
    return new Set([text]);
  }

  if (text[text.length - 1] !== "}") {
    throw new Error(
      `Expected '}', found: ${JSON.stringify(text[text.length - 1])}`
    );
  }

  const res = new Set<string>();
  const tags = text.slice(1, -1).split(/\s+/);
  for (const tag of tags) {
    if (tag[0] !== ".") {
      throw new Error(`Expected '.', found: ${JSON.stringify(tag[0])}`);
    }
    checkTag(tag.slice(1));
    res.add(tag.slice(1));
  }

  return res;
}

// ----------------------
// Selector mini-language
// ----------------------

export abstract class Selector {
  abstract eval(atoms: Set<string> | string[]): boolean;
}

export class Atom extends Selector {
  constructor(public readonly name: string) {
    super();
  }

  eval(atoms: Set<string> | string[]): boolean {
    if (atoms instanceof Set) {
      return atoms.has(this.name);
    }
    return atoms.includes(this.name);
  }
}

export class Not extends Selector {
  constructor(public readonly op: Selector) {
    super();
  }

  eval(atoms: Set<string> | string[]): boolean {
    return !this.op.eval(atoms);
  }
}

export class And extends Selector {
  constructor(public readonly ops: readonly Selector[]) {
    super();
  }

  eval(atoms: Set<string> | string[]): boolean {
    return this.ops.every((op) => op.eval(atoms));
  }
}

export class Or extends Selector {
  constructor(public readonly ops: readonly Selector[]) {
    super();
  }

  eval(atoms: Set<string> | string[]): boolean {
    return this.ops.some((op) => op.eval(atoms));
  }
}

const SPECIAL = new Set(["!", "&", "|", "(", ")"]);

function* selectorLexer(it: Iterable<string>): Generator<string> {
  const iterator = it[Symbol.iterator]();
  let la = iterator.next().value || "";

  while (true) {
    while (la && /\s/.test(la)) {
      la = iterator.next().value || "";
    }

    if (!la) {
      yield "";
      return;
    }

    if (SPECIAL.has(la)) {
      yield la;
      la = iterator.next().value || "";
      continue;
    }

    const buf: string[] = [];
    while (la && (/\w/.test(la) || la === "_")) {
      buf.push(la);
      la = iterator.next().value || "";
    }

    if (buf.length === 0) {
      throw new Error(`Unexpected character: ${JSON.stringify(la)}`);
    }

    yield buf.join("");
  }
}

export class SelectorParser {
  private _la: string = "";
  private _it: Iterator<string>;

  constructor(selector: string) {
    this._it = selectorLexer(selector)[Symbol.iterator]();
    this._consume();
  }

  private _consume(): void {
    this._la = this._it.next().value || "";
  }

  private _match(token: string): void {
    if (this._la !== token) {
      throw new Error(`Unexpected token: ${token}`);
    }
    this._consume();
  }

  parse(): Selector {
    const res = this._or();
    if (this._la) {
      throw new Error(`Expected EOF, found: ${this._la}`);
    }
    return res;
  }

  private _or(): Selector {
    const ops = [this._and()];
    while (this._la === "|") {
      this._consume();
      ops.push(this._and());
    }
    if (ops.length > 1) {
      return new Or(ops);
    }
    return ops[0]!;
  }

  private _and(): Selector {
    const ops = [this._lit()];
    while (this._la === "&") {
      this._consume();
      ops.push(this._lit());
    }
    if (ops.length > 1) {
      return new And(ops);
    }
    return ops[0]!;
  }

  private _lit(): Selector {
    if (!this._la) {
      throw new Error("Unexpected EOF");
    }

    if (this._la === "(") {
      this._consume();
      const expr = this._or();
      this._match(")");
      return expr;
    }

    if (this._la === "!") {
      this._consume();
      const lit = this._lit();
      return new Not(lit);
    }

    if (this._la.length > 1 || /[\w-]/.test(this._la)) {
      const atom = this._la;
      this._consume();
      return new Atom(atom);
    }

    throw new Error(`Unexpected token: ${this._la}`);
  }
}
