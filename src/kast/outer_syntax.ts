export interface Location {
  start: { line: number; col: number };
  end: { line: number; col: number };
}

export abstract class AST {
  constructor(
    public source?: string | null,
    public location?: Location | null
  ) {}
}

export class Att extends AST implements Iterable<[string, string]> {
  public readonly items: Array<[string, string]>;

  constructor(items: Iterable<[string, string]> = []) {
    super();
    this.items = Array.from(items);
  }

  get(index: number): [string, string] | undefined {
    return this.items[index];
  }

  get length(): number {
    return this.items.length;
  }

  slice(start?: number, end?: number): Array<[string, string]> {
    return this.items.slice(start, end);
  }

  *[Symbol.iterator](): Iterator<[string, string]> {
    yield* this.items;
  }

  // Helper method to get attribute value by key
  getValue(key: string): string | undefined {
    const item = this.items.find(([k]) => k === key);
    return item?.[1];
  }

  // Helper method to check if attribute exists
  has(key: string): boolean {
    return this.items.some(([k]) => k === key);
  }
}

export const EMPTY_ATT = new Att();

export abstract class Sentence extends AST {}

export abstract class SyntaxSentence extends Sentence {}

export enum Assoc {
  LEFT = "left",
  RIGHT = "right",
  NON_ASSOC = "non-assoc",
}

export class SortDecl extends AST {
  public readonly params: string[];
  public readonly args: string[];

  constructor(
    public name: string,
    params: Iterable<string> = [],
    args: Iterable<string> = []
  ) {
    super();
    this.params = Array.from(params);
    this.args = Array.from(args);
  }
}

export class Sort extends AST {
  public readonly args: Array<number | string>;

  constructor(public name: string, args: Iterable<number | string> = []) {
    super();
    this.args = Array.from(args);
  }
}

export class SyntaxDecl extends SyntaxSentence {
  constructor(public decl: SortDecl, public att: Att = EMPTY_ATT) {
    super();
  }
}

export class SyntaxDefn extends SyntaxSentence {
  public readonly blocks: PriorityBlock[];

  constructor(public decl: SortDecl, blocks: Iterable<PriorityBlock> = []) {
    super();
    this.blocks = Array.from(blocks);
  }
}

export class PriorityBlock extends AST {
  public readonly productions: ProductionLike[];

  constructor(
    productions: Iterable<ProductionLike>,
    public assoc: Assoc | null = null
  ) {
    super();
    this.productions = Array.from(productions);
  }
}

export abstract class ProductionLike extends AST {
  abstract att: Att;
}

export class Production extends ProductionLike {
  public readonly items: ProductionItem[];

  constructor(items: Iterable<ProductionItem>, public att: Att = EMPTY_ATT) {
    super();
    this.items = Array.from(items);
  }
}

export abstract class ProductionItem extends AST {}

export class Terminal extends ProductionItem {
  constructor(public value: string) {
    super();
  }
}

export class NonTerminal extends ProductionItem {
  constructor(public sort: Sort, public name: string = "") {
    super();
  }
}

export class Lexical extends ProductionItem {
  constructor(public regex: string) {
    super();
  }
}

export class UserList extends ProductionLike {
  constructor(
    public sort: string,
    public sep: string,
    public nonEmpty: boolean = false,
    public att: Att = EMPTY_ATT
  ) {
    super();
  }
}

export class SyntaxSynonym extends SyntaxSentence {
  constructor(
    public newDecl: SortDecl,
    public old: Sort,
    public att: Att = EMPTY_ATT
  ) {
    super();
  }
}

export class SyntaxPriority extends SyntaxSentence {
  public readonly groups: string[][];

  constructor(groups: Iterable<Iterable<string>>) {
    super();
    this.groups = Array.from(groups, (group) => Array.from(group));
  }
}

export class SyntaxAssoc extends SyntaxSentence {
  public readonly klabels: string[];

  constructor(public assoc: Assoc, klabels: Iterable<string>) {
    super();
    this.klabels = Array.from(klabels);
  }
}

export class SyntaxLexical extends SyntaxSentence {
  constructor(public name: string, public regex: string) {
    super();
  }
}

export abstract class StringSentence extends Sentence {
  static readonly prefix: string;

  constructor(
    public bubble: string,
    public label: string = "",
    public att: Att = EMPTY_ATT
  ) {
    super();
  }
}

export class Rule extends StringSentence {
  static readonly prefix = "rule";

  constructor(bubble: string, label: string = "", att: Att = EMPTY_ATT) {
    super(bubble, label, att);
  }
}

export class Claim extends StringSentence {
  static readonly prefix = "claim";

  constructor(bubble: string, label: string = "", att: Att = EMPTY_ATT) {
    super(bubble, label, att);
  }
}

export class Config extends StringSentence {
  static readonly prefix = "configuration";

  constructor(bubble: string, label: string = "", att: Att = EMPTY_ATT) {
    super(bubble, label, att);
  }
}

export class Context extends StringSentence {
  static readonly prefix = "context";

  constructor(bubble: string, label: string = "", att: Att = EMPTY_ATT) {
    super(bubble, label, att);
  }
}

export class Alias extends StringSentence {
  static readonly prefix = "context alias";

  constructor(bubble: string, label: string = "", att: Att = EMPTY_ATT) {
    super(bubble, label, att);
  }
}

export class Import extends AST {
  constructor(public moduleName: string, public isPublic: boolean = true) {
    super();
  }
}

export class Module extends AST {
  public readonly sentences: Sentence[];
  public readonly imports: Import[];

  constructor(
    public name: string,
    sentences: Iterable<Sentence> = [],
    imports: Iterable<Import> = [],
    public att: Att = EMPTY_ATT,
    source?: string | null,
    location?: Location | null
  ) {
    super(source, location);
    this.sentences = Array.from(sentences);
    this.imports = Array.from(imports);
  }
}

export class Require extends AST {
  constructor(public path: string) {
    super();
  }
}

export class Definition extends AST {
  public readonly modules: Module[];
  public readonly requires: Require[];

  constructor(
    modules: Iterable<Module> = [],
    requires: Iterable<Require> = []
  ) {
    super();
    this.modules = Array.from(modules);
    this.requires = Array.from(requires);
  }
}

// Type aliases for convenience
export type ProductionItemType = Terminal | NonTerminal | Lexical;
export type ProductionLikeType = Production | UserList;
export type SentenceType = SyntaxSentence | StringSentence;
export type SyntaxSentenceType =
  | SyntaxDecl
  | SyntaxDefn
  | SyntaxPriority
  | SyntaxAssoc
  | SyntaxLexical
  | SyntaxSynonym;
export type StringSentenceType = Rule | Claim | Config | Context | Alias;
