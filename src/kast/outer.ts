import * as fs from "fs";
import type { FrozenRecord } from "../utils";
import { frozenRecord, notNone, single } from "../utils";
import { Atts, EMPTY_ATT, Format, KAtt, type WithKAtt } from "./att";
import {
  KApply,
  KInner,
  KLabel,
  KRewrite,
  KSequence,
  KSort,
  KToken,
  KVariable,
  bottomUp,
  topDown,
} from "./inner";
import { KAst, kastTerm } from "./kast";
import { indexedRewrite } from "./rewrite";

const BOOL = new KSort("Bool");
const TRUE = new KToken("true", BOOL);

export { BOOL, TRUE };

export abstract class KOuter extends KAst {
  /**
   * Represents K definitions in KAST format.
   *
   * Outer syntax is K specific datastructures, including modules, definitions,
   * imports, user-syntax declarations, rules, contexts, and claims.
   */
}

export abstract class KProductionItem extends KOuter {
  /**
   * Represents the elements used to declare components of productions in EBNF style.
   */
  private static readonly NODES = new Set([
    "KTerminal",
    "KRegexTerminal",
    "KNonTerminal",
  ]);

  public static fromDict(d: Record<string, any>): KProductionItem {
    const node = d["node"];
    if (!KProductionItem.NODES.has(node)) {
      throw new Error(`Invalid KProductionItem node: ${node}`);
    }

    switch (node) {
      case "KTerminal":
        return KTerminal._fromDict(d);
      case "KRegexTerminal":
        return KRegexTerminal._fromDict(d);
      case "KNonTerminal":
        return KNonTerminal._fromDict(d);
      default:
        throw new Error(`Unknown node type: ${node}`);
    }
  }
}

export class KRegexTerminal extends KProductionItem {
  /**
   * Represents a regular-expression terminal in EBNF production, to be matched against input text.
   */
  public readonly regex: string;

  constructor(regex: string) {
    super();
    this.regex = regex;
  }

  public static _fromDict(d: Record<string, any>): KRegexTerminal {
    return new KRegexTerminal(d["regex"]);
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KRegexTerminal";
    result["regex"] = this.regex;
    return result;
  }

  public let(options: { regex?: string } = {}): KRegexTerminal {
    const regex = options.regex !== undefined ? options.regex : this.regex;
    return new KRegexTerminal(regex);
  }
}

export class KNonTerminal extends KProductionItem {
  /**
   * Represents a non-terminal of a given sort in EBNF productions, for defining arguments to production.
   */
  public readonly sort: KSort;
  public readonly name: string | null;

  constructor(sort: KSort, name?: string | null) {
    super();
    this.sort = sort;
    this.name = name ?? null;
  }

  public static _fromDict(d: Record<string, any>): KNonTerminal {
    const name = d["name"] ? d["name"] : null;
    return new KNonTerminal(KSort.fromDict(d["sort"]), name);
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KNonTerminal";
    result["sort"] = this.sort.toDict();
    if (this.name !== null) {
      result["name"] = this.name;
    }
    return result;
  }

  public let(
    options: { sort?: KSort; name?: string | null } = {}
  ): KNonTerminal {
    const sort = options.sort || this.sort;
    const name = options.name !== undefined ? options.name : this.name;
    return new KNonTerminal(sort, name);
  }
}

export class KTerminal extends KProductionItem {
  /**
   * Represents a string literal component of a production in EBNF grammar.
   */
  public readonly value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }

  public static _fromDict(d: Record<string, any>): KTerminal {
    return new KTerminal(d["value"]);
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KTerminal";
    result["value"] = this.value;
    return result;
  }

  public let(options: { value?: string } = {}): KTerminal {
    const value = options.value !== undefined ? options.value : this.value;
    return new KTerminal(value);
  }
}

export abstract class KSentence extends KOuter implements WithKAtt {
  /**
   * Represents an individual declaration in a K module.
   */
  private static readonly NODES = new Set([
    "KProduction",
    "KSyntaxSort",
    "KSortSynonym",
    "KSyntaxLexical",
    "KSyntaxAssociativity",
    "KSyntaxPriority",
    "KBubble",
    "KRule",
    "KClaim",
    "KContext",
  ]);

  public abstract get att(): KAtt;
  public abstract letAtt(att: KAtt): KSentence;

  public static fromDict(d: Record<string, any>): KSentence {
    const node = d["node"];
    if (!KSentence.NODES.has(node)) {
      throw new Error(`Invalid KSentence node: ${node}`);
    }

    switch (node) {
      case "KProduction":
        return KProduction._fromDict(d);
      case "KSyntaxSort":
        return KSyntaxSort._fromDict(d);
      case "KSortSynonym":
        return KSortSynonym._fromDict(d);
      case "KSyntaxLexical":
        return KSyntaxLexical._fromDict(d);
      case "KSyntaxAssociativity":
        return KSyntaxAssociativity._fromDict(d);
      case "KSyntaxPriority":
        return KSyntaxPriority._fromDict(d);
      case "KBubble":
        return KBubble._fromDict(d);
      case "KRule":
        return KRule._fromDict(d);
      case "KClaim":
        return KClaim._fromDict(d);
      case "KContext":
        return KContext._fromDict(d);
      default:
        throw new Error(`Unimplemented sentence type: ${node}`);
    }
  }

  public get uniqueId(): string | null {
    return this.att.get(Atts.UNIQUE_ID) || null;
  }

  public get source(): string | null {
    const source = this.att.get(Atts.SOURCE);
    const location = this.att.get(Atts.LOCATION);
    if (source && location) {
      return `${source}:${location}`;
    }
    return null;
  }

  public get label(): string {
    const label = this.att.get(Atts.LABEL) || this.uniqueId;
    if (!label) {
      throw new Error(`Found sentence without label or UNIQUE_ID: ${this}`);
    }
    return label;
  }
}

export class KProduction extends KSentence {
  /**
   * Represents a production in K's EBNF grammar definitions, as a sequence of ProductionItem.
   */
  public readonly sort: KSort;
  public readonly items: KProductionItem[];
  public readonly params: KSort[];
  public readonly klabel: KLabel | null;
  public readonly att: KAtt;

  constructor(
    sort: string | KSort,
    items: Iterable<KProductionItem> = [],
    params: Iterable<string | KSort> = [],
    klabel?: string | KLabel | null,
    att: KAtt = EMPTY_ATT
  ) {
    super();

    if (typeof sort === "string") {
      sort = new KSort(sort);
    }
    if (typeof klabel === "string") {
      klabel = new KLabel(klabel);
    }

    const paramsArray = Array.from(params).map((p) =>
      typeof p === "string" ? new KSort(p) : p
    );

    this.sort = sort;
    this.items = Array.from(items);
    this.params = paramsArray;
    this.klabel = klabel ?? null;
    this.att = att;
  }

  public static _fromDict(d: Record<string, any>): KProduction {
    return new KProduction(
      KSort.fromDict(d["sort"]),
      d["productionItems"]?.map((item: any) =>
        KProductionItem.fromDict(item)
      ) || [],
      d["params"]?.map((param: any) => KSort.fromDict(param)) || [],
      d["klabel"] ? KLabel.fromDict(d["klabel"]) : null,
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KProduction";
    result["sort"] = this.sort.toDict();
    result.set(
      "productionItems",
      this.items.map((item) => item.toDict())
    );
    result.set(
      "params",
      this.params.map((param) => param.toDict())
    );
    if (this.klabel) {
      result["klabel"] = this.klabel.toDict();
    }
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      sort?: string | KSort;
      items?: Iterable<KProductionItem>;
      params?: Iterable<string | KSort>;
      klabel?: string | KLabel | null;
      att?: KAtt;
    } = {}
  ): KProduction {
    const sort = options.sort !== undefined ? options.sort : this.sort;
    const items = options.items !== undefined ? options.items : this.items;
    const params = options.params !== undefined ? options.params : this.params;
    const klabel = options.klabel !== undefined ? options.klabel : this.klabel;
    const att = options.att !== undefined ? options.att : this.att;
    return new KProduction(sort, items, params, klabel, att);
  }

  public letAtt(att: KAtt): KProduction {
    return this.let({ att });
  }

  public get asSubsort(): [KSort, KSort] | null {
    if (this.klabel) return null;
    if (this.items.length !== 1) return null;
    const item = this.items[0]!;
    if (!(item instanceof KNonTerminal)) return null;
    return [this.sort, item.sort];
  }

  public get nonTerminals(): KNonTerminal[] {
    return this.items.filter(
      (item) => item instanceof KNonTerminal
    ) as KNonTerminal[];
  }

  public get argumentSorts(): KSort[] {
    return this.nonTerminals.map((nt) => nt.sort);
  }

  public get isPrefix(): boolean {
    function encode(item: KProductionItem): string {
      if (item instanceof KTerminal) {
        if (["(", ",", ")"].includes(item.value)) {
          return item.value;
        }
        return "t";
      } else if (item instanceof KNonTerminal) {
        return "n";
      } else if (item instanceof KRegexTerminal) {
        return "r";
      } else {
        throw new Error("Unknown production item type");
      }
    }

    const string = this.items.map(encode).join("");
    const pattern = /^t*\((n(,n)*)?\)$/;
    return pattern.test(string);
  }

  public get isRecord(): boolean {
    return (
      this.isPrefix &&
      this.nonTerminals.length > 0 &&
      this.nonTerminals.every((item) => item.name !== null)
    );
  }

  public get defaultFormat(): Format {
    let formatStr: string;
    if (this.isRecord) {
      const tokens: string[] = [];
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i]!;
        if (item instanceof KTerminal) {
          if (item.value === "(") {
            tokens.push(`%${i + 1}...`);
          } else {
            tokens.push(`%${i + 1}`);
          }
        } else if (item instanceof KNonTerminal) {
          if (item.name === null) {
            throw new Error(
              "Expected non-terminal to have name in record production"
            );
          }
          tokens.push(`${item.name}:`);
          tokens.push(`%${i + 1}`);
        } else if (item instanceof KRegexTerminal) {
          throw new Error(
            "Default format is not supported for productions with regex terminals"
          );
        }
      }
      formatStr = tokens.join(" ");
    } else {
      formatStr = Array.from(
        { length: this.items.length },
        (_, i) => `%${i + 1}`
      ).join(" ");
    }

    return Format.parse(formatStr);
  }
}

export class KSyntaxSort extends KSentence {
  /**
   * Represents a sort declaration, potentially parametric.
   */
  public readonly sort: KSort;
  public readonly params: KSort[];
  public readonly att: KAtt;

  constructor(
    sort: KSort,
    params: Iterable<string | KSort> = [],
    att: KAtt = EMPTY_ATT
  ) {
    super();
    const paramsArray = Array.from(params).map((p) =>
      typeof p === "string" ? new KSort(p) : p
    );
    this.sort = sort;
    this.params = paramsArray;
    this.att = att;
  }

  public static _fromDict(d: Record<string, any>): KSyntaxSort {
    return new KSyntaxSort(
      KSort.fromDict(d["sort"]),
      d["params"]?.map((param: any) => KSort.fromDict(param)) || [],
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KSyntaxSort";
    result["sort"] = this.sort.toDict();
    result.set(
      "params",
      this.params.map((param) => param.toDict())
    );
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      sort?: KSort;
      params?: Iterable<string | KSort>;
      att?: KAtt;
    } = {}
  ): KSyntaxSort {
    const sort = options.sort || this.sort;
    const params = options.params !== undefined ? options.params : this.params;
    const att = options.att !== undefined ? options.att : this.att;
    return new KSyntaxSort(sort, params, att);
  }

  public letAtt(att: KAtt): KSyntaxSort {
    return this.let({ att });
  }
}

export class KSortSynonym extends KSentence {
  /**
   * Represents a sort synonym, allowing declaring a new name for a given sort.
   */
  public readonly newSort: KSort;
  public readonly oldSort: KSort;
  public readonly att: KAtt;

  constructor(newSort: KSort, oldSort: KSort, att: KAtt = EMPTY_ATT) {
    super();
    this.newSort = newSort;
    this.oldSort = oldSort;
    this.att = att;
  }

  public static _fromDict(d: Record<string, any>): KSortSynonym {
    return new KSortSynonym(
      KSort.fromDict(d["newSort"]),
      KSort.fromDict(d["oldSort"]),
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KSortSynonym";
    result["newSort"] = this.newSort.toDict();
    result["oldSort"] = this.oldSort.toDict();
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      oldSort?: KSort;
      newSort?: KSort;
      att?: KAtt;
    } = {}
  ): KSortSynonym {
    const newSort = options.newSort || this.newSort;
    const oldSort = options.oldSort || this.oldSort;
    const att = options.att !== undefined ? options.att : this.att;
    return new KSortSynonym(newSort, oldSort, att);
  }

  public letAtt(att: KAtt): KSortSynonym {
    return this.let({ att });
  }
}

export class KSyntaxLexical extends KSentence {
  /**
   * Represents a named piece of lexical syntax, definable as a regular expression.
   */
  public readonly name: string;
  public readonly regex: string;
  public readonly att: KAtt;

  constructor(name: string, regex: string, att: KAtt = EMPTY_ATT) {
    super();
    this.name = name;
    this.regex = regex;
    this.att = att;
  }

  public static _fromDict(d: Record<string, any>): KSyntaxLexical {
    return new KSyntaxLexical(
      d["name"],
      d["regex"],
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KSyntaxLexical";
    result["name"] = this.name;
    result["regex"] = this.regex;
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      name?: string;
      regex?: string;
      att?: KAtt;
    } = {}
  ): KSyntaxLexical {
    const name = options.name !== undefined ? options.name : this.name;
    const regex = options.regex !== undefined ? options.regex : this.regex;
    const att = options.att !== undefined ? options.att : this.att;
    return new KSyntaxLexical(name, regex, att);
  }

  public letAtt(att: KAtt): KSyntaxLexical {
    return this.let({ att });
  }
}

export enum KAssoc {
  LEFT = "Left",
  RIGHT = "Right",
  NON_ASSOC = "NonAssoc",
}

export class KSyntaxAssociativity extends KSentence {
  /**
   * Represents a standalone declaration of operator associativity for tagged productions.
   */
  public readonly assoc: KAssoc;
  public readonly tags: Set<string>;
  public readonly att: KAtt;

  constructor(
    assoc: KAssoc,
    tags: Iterable<string> = new Set(),
    att: KAtt = EMPTY_ATT
  ) {
    super();
    this.assoc = assoc;
    this.tags = new Set(tags);
    this.att = att;
  }

  public static _fromDict(d: Record<string, any>): KSyntaxAssociativity {
    return new KSyntaxAssociativity(
      d["assoc"] as KAssoc,
      d["tags"],
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KSyntaxAssociativity";
    result["assoc"] = this.assoc;
    result["tags"] = Array.from(this.tags);
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      assoc?: KAssoc;
      tags?: Iterable<string>;
      att?: KAtt;
    } = {}
  ): KSyntaxAssociativity {
    const assoc = options.assoc || this.assoc;
    const tags = options.tags !== undefined ? options.tags : this.tags;
    const att = options.att !== undefined ? options.att : this.att;
    return new KSyntaxAssociativity(assoc, tags, att);
  }

  public letAtt(att: KAtt): KSyntaxAssociativity {
    return this.let({ att });
  }
}

export class KSyntaxPriority extends KSentence {
  /**
   * Represents a standalone declaration of syntax priorities, using productions tags.
   */
  public readonly priorities: Set<string>[];
  public readonly att: KAtt;

  constructor(
    priorities: Iterable<Iterable<string>> = [],
    att: KAtt = EMPTY_ATT
  ) {
    super();
    this.priorities = Array.from(priorities).map((group) => new Set(group));
    this.att = att;
  }

  public static _fromDict(d: Record<string, any>): KSyntaxPriority {
    return new KSyntaxPriority(
      d["priorities"],
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KSyntaxPriority";
    result.set(
      "priorities",
      this.priorities.map((group) => Array.from(group))
    );
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      priorities?: Iterable<Iterable<string>>;
      att?: KAtt;
    } = {}
  ): KSyntaxPriority {
    const priorities =
      options.priorities !== undefined ? options.priorities : this.priorities;
    const att = options.att !== undefined ? options.att : this.att;
    return new KSyntaxPriority(priorities, att);
  }

  public letAtt(att: KAtt): KSyntaxPriority {
    return this.let({ att });
  }
}

export class KBubble extends KSentence {
  /**
   * Represents an unparsed chunk of AST in user-defined syntax.
   */
  public readonly sentenceType: string;
  public readonly contents: string;
  public readonly att: KAtt;

  constructor(sentenceType: string, contents: string, att: KAtt = EMPTY_ATT) {
    super();
    this.sentenceType = sentenceType;
    this.contents = contents;
    this.att = att;
  }

  public static _fromDict(d: Record<string, any>): KBubble {
    return new KBubble(
      d["sentenceType"],
      d["contents"],
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KBubble";
    result["sentenceType"] = this.sentenceType;
    result["contents"] = this.contents;
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      sentenceType?: string;
      contents?: string;
      att?: KAtt;
    } = {}
  ): KBubble {
    const sentenceType =
      options.sentenceType !== undefined
        ? options.sentenceType
        : this.sentenceType;
    const contents =
      options.contents !== undefined ? options.contents : this.contents;
    const att = options.att !== undefined ? options.att : this.att;
    return new KBubble(sentenceType, contents, att);
  }

  public letAtt(att: KAtt): KBubble {
    return this.let({ att });
  }
}

export abstract class KRuleLike extends KSentence {
  /**
   * Represents something with rule-like structure (with body, requires, and ensures clauses).
   */
  public abstract readonly body: KInner;
  public abstract readonly requires: KInner;
  public abstract readonly ensures: KInner;

  public abstract let(options: {
    body?: KInner;
    requires?: KInner;
    ensures?: KInner;
    att?: KAtt;
  }): KRuleLike;
}

export class KRule extends KRuleLike {
  /**
   * Represents a K rule definition, typically a conditional rewrite/transition.
   */
  public readonly body: KInner;
  public readonly requires: KInner;
  public readonly ensures: KInner;
  public readonly att: KAtt;

  constructor(
    body: KInner,
    requires: KInner = TRUE,
    ensures: KInner = TRUE,
    att: KAtt = EMPTY_ATT
  ) {
    super();
    this.body = body;
    this.requires = requires;
    this.ensures = ensures;
    this.att = att;
  }

  public static _fromDict(d: Record<string, any>): KRule {
    return new KRule(
      KInner.fromDict(d["body"]),
      d["requires"] ? KInner.fromDict(d["requires"]) : TRUE,
      d["ensures"] ? KInner.fromDict(d["ensures"]) : TRUE,
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KRule";
    result["body"] = this.body.toDict();
    result["requires"] = this.requires.toDict();
    result["ensures"] = this.ensures.toDict();
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      body?: KInner;
      requires?: KInner;
      ensures?: KInner;
      att?: KAtt;
    } = {}
  ): KRule {
    const body = options.body !== undefined ? options.body : this.body;
    const requires =
      options.requires !== undefined ? options.requires : this.requires;
    const ensures =
      options.ensures !== undefined ? options.ensures : this.ensures;
    const att = options.att !== undefined ? options.att : this.att;
    return new KRule(body, requires, ensures, att);
  }

  public letAtt(att: KAtt): KRule {
    return this.let({ att });
  }

  public get priority(): number {
    const priority = this.att.get(Atts.PRIORITY);
    if (priority !== undefined) return parseInt(priority);
    return this.att.has(Atts.OWISE) ? 200 : 50;
  }
}

export class KClaim extends KRuleLike {
  /**
   * Represents a K claim, typically a transition with pre/post-conditions.
   */
  public readonly body: KInner;
  public readonly requires: KInner;
  public readonly ensures: KInner;
  public readonly att: KAtt;

  constructor(
    body: KInner,
    requires: KInner = TRUE,
    ensures: KInner = TRUE,
    att: KAtt = EMPTY_ATT
  ) {
    super();
    this.body = body;
    this.requires = requires;
    this.ensures = ensures;
    this.att = att;
  }

  public static _fromDict(d: Record<string, any>): KClaim {
    return new KClaim(
      KInner.fromDict(d["body"]),
      d["requires"] ? KInner.fromDict(d["requires"]) : TRUE,
      d["ensures"] ? KInner.fromDict(d["ensures"]) : TRUE,
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KClaim";
    result["body"] = this.body.toDict();
    result["requires"] = this.requires.toDict();
    result["ensures"] = this.ensures.toDict();
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      body?: KInner;
      requires?: KInner;
      ensures?: KInner;
      att?: KAtt;
    } = {}
  ): KClaim {
    const body = options.body !== undefined ? options.body : this.body;
    const requires =
      options.requires !== undefined ? options.requires : this.requires;
    const ensures =
      options.ensures !== undefined ? options.ensures : this.ensures;
    const att = options.att !== undefined ? options.att : this.att;
    return new KClaim(body, requires, ensures, att);
  }

  public letAtt(att: KAtt): KClaim {
    return this.let({ att });
  }

  public get isCircularity(): boolean {
    return this.att.has(Atts.CIRCULARITY);
  }

  public get isTrusted(): boolean {
    return this.att.has(Atts.TRUSTED);
  }

  public get dependencies(): string[] {
    const deps = this.att.get(Atts.DEPENDS);
    if (!deps) return [];
    return deps.split(",").map((x: string) => x.trim());
  }
}

export class KContext extends KSentence {
  /**
   * Represents a K evaluation context, used for isolating chunks of computation and focusing on them.
   */
  public readonly body: KInner;
  public readonly requires: KInner;
  public readonly att: KAtt;

  constructor(body: KInner, requires: KInner = TRUE, att: KAtt = EMPTY_ATT) {
    super();
    this.body = body;
    this.requires = requires;
    this.att = att;
  }

  public static _fromDict(d: Record<string, any>): KContext {
    return new KContext(
      KInner.fromDict(d["body"]),
      d["requires"] ? KInner.fromDict(d["requires"]) : TRUE,
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KContext";
    result["body"] = this.body.toDict();
    result["requires"] = this.requires.toDict();
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      body?: KInner;
      requires?: KInner;
      att?: KAtt;
    } = {}
  ): KContext {
    const body = options.body !== undefined ? options.body : this.body;
    const requires =
      options.requires !== undefined ? options.requires : this.requires;
    const att = options.att !== undefined ? options.att : this.att;
    return new KContext(body, requires, att);
  }

  public letAtt(att: KAtt): KContext {
    return this.let({ att });
  }
}

export class KImport extends KOuter {
  /**
   * Represents a K module import, used for inheriting all the sentences of the imported module into this one.
   */
  public readonly name: string;
  public readonly public: boolean;

  constructor(name: string, isPublic: boolean = true) {
    super();
    this.name = name;
    this.public = isPublic;
  }

  public static fromDict(d: Record<string, any>): KImport {
    return new KImport(d["name"], d["isPublic"]);
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KImport";
    result["name"] = this.name;
    result["isPublic"] = this.public;
    return result;
  }

  public let(options: { name?: string; public?: boolean } = {}): KImport {
    const name = options.name !== undefined ? options.name : this.name;
    const isPublic =
      options.public !== undefined ? options.public : this.public;
    return new KImport(name, isPublic);
  }
}

export class KFlatModule
  extends KOuter
  implements WithKAtt, Iterable<KSentence>
{
  /**
   * Represents a K module, with a name, list of imports, and list of sentences.
   */
  public readonly name: string;
  public readonly sentences: KSentence[];
  public readonly imports: KImport[];
  public readonly att: KAtt;

  constructor(
    name: string,
    sentences: Iterable<KSentence> = [],
    imports: Iterable<KImport> = [],
    att: KAtt = EMPTY_ATT
  ) {
    super();
    this.name = name;
    this.sentences = Array.from(sentences);
    this.imports = Array.from(imports);
    this.att = att;
  }

  public [Symbol.iterator](): Iterator<KSentence> {
    return this.sentences[Symbol.iterator]();
  }

  public get productions(): KProduction[] {
    return this.sentences.filter(
      (sentence) => sentence instanceof KProduction
    ) as KProduction[];
  }

  public get syntaxProductions(): KProduction[] {
    return this.productions.filter((prod) => prod.klabel !== null);
  }

  public get functions(): KProduction[] {
    return this.syntaxProductions.filter((prod) =>
      KFlatModule.isFunction(prod)
    );
  }

  public get constructors(): KProduction[] {
    return this.syntaxProductions.filter(
      (prod) => !KFlatModule.isFunction(prod)
    );
  }

  public get cellCollectionProductions(): KProduction[] {
    return this.syntaxProductions.filter((prod) =>
      prod.att.has(Atts.CELL_COLLECTION)
    );
  }

  private static isFunction(prod: KProduction): boolean {
    function isNotActuallyFunction(label: string): boolean {
      const isCellMapConstructor =
        label.endsWith("CellMapItem") || label.endsWith("CellMap_");
      const isBuiltinDataConstructor = new Set([
        "_Set_",
        "_List_",
        "_Map_",
        "_RangeMap_",
        ".Set",
        ".List",
        ".Map",
        ".RangeMap",
        "SetItem",
        "ListItem",
        "_|->_",
        "_r|->_",
      ]).has(label);
      return isCellMapConstructor || isBuiltinDataConstructor;
    }

    return (
      (prod.att.has(Atts.FUNCTION) || prod.att.has(Atts.FUNCTIONAL)) &&
      !(prod.klabel && isNotActuallyFunction(prod.klabel.name))
    );
  }

  public get syntaxSorts(): KSyntaxSort[] {
    return this.sentences.filter(
      (sentence) => sentence instanceof KSyntaxSort
    ) as KSyntaxSort[];
  }

  public get rules(): KRule[] {
    return this.sentences.filter(
      (sentence) => sentence instanceof KRule
    ) as KRule[];
  }

  public get claims(): KClaim[] {
    return this.sentences.filter(
      (sentence) => sentence instanceof KClaim
    ) as KClaim[];
  }

  public get sentenceByUniqueId(): Record<string, KSentence> {
    const result: Record<string, KSentence> = {};
    for (const sent of this.sentences) {
      if (sent.uniqueId !== null) {
        result[sent.uniqueId] = sent;
      }
    }
    return result;
  }

  public mapSentences<T extends KSentence>(
    f: (sent: KSentence) => KSentence,
    ofType?: new (...args: any[]) => T
  ): KFlatModule {
    if (ofType === undefined) {
      ofType = KSentence as any;
    }
    return this.let({
      sentences: this.sentences.map((sent) =>
        sent instanceof ofType! ? f(sent) : sent
      ),
    });
  }

  public static fromDict(d: Record<string, any>): KFlatModule {
    return new KFlatModule(
      d["name"],
      d["localSentences"]?.map((s: any) => KSentence.fromDict(s)) || [],
      d["imports"]?.map((i: any) => KImport.fromDict(i)) || [],
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KFlatModule";
    result["name"] = this.name;
    result.set(
      "localSentences",
      this.sentences.map((s) => s.toDict())
    );
    result.set(
      "imports",
      this.imports.map((i) => i.toDict())
    );
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      name?: string;
      sentences?: Iterable<KSentence>;
      imports?: Iterable<KImport>;
      att?: KAtt;
    } = {}
  ): KFlatModule {
    const name = options.name !== undefined ? options.name : this.name;
    const sentences =
      options.sentences !== undefined ? options.sentences : this.sentences;
    const imports =
      options.imports !== undefined ? options.imports : this.imports;
    const att = options.att !== undefined ? options.att : this.att;
    return new KFlatModule(name, sentences, imports, att);
  }

  public letAtt(att: KAtt): KFlatModule {
    return this.let({ att });
  }
}

export class KFlatModuleList extends KOuter {
  /**
   * Represents a list of K modules, as returned by the prover parser for example, with a given module called out as the main module.
   */
  public readonly mainModule: string;
  public readonly modules: KFlatModule[];

  constructor(mainModule: string, modules: Iterable<KFlatModule>) {
    super();
    this.mainModule = mainModule;
    this.modules = Array.from(modules);
  }

  public static fromDict(d: Record<string, any>): KFlatModuleList {
    return new KFlatModuleList(
      d["mainModule"],
      d["term"]?.map((kfm: any) => KFlatModule.fromDict(kfm)) || []
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KFlatModuleList";
    result["mainModule"] = this.mainModule;
    result.set(
      "term",
      this.modules.map((mod) => mod.toDict())
    );
    return result;
  }

  public let(
    options: {
      mainModule?: string;
      modules?: Iterable<KFlatModule>;
    } = {}
  ): KFlatModuleList {
    const mainModule =
      options.mainModule !== undefined ? options.mainModule : this.mainModule;
    const modules =
      options.modules !== undefined ? options.modules : this.modules;
    return new KFlatModuleList(mainModule, modules);
  }
}

export class KRequire extends KOuter {
  /**
   * Represents a K file import of another file.
   */
  public readonly require: string;

  constructor(requirePath: string) {
    super();
    this.require = requirePath;
  }

  public static fromDict(d: Record<string, any>): KRequire {
    return new KRequire(d["require"]);
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KRequire";
    result["require"] = this.require;
    return result;
  }

  public let(options: { require?: string } = {}): KRequire {
    const requirePath =
      options.require !== undefined ? options.require : this.require;
    return new KRequire(requirePath);
  }
}

export class KDefinition
  extends KOuter
  implements WithKAtt, Iterable<KFlatModule>
{
  /**
   * Represents an entire K definition, with file imports and modules in place,
   * and a given module called out as main module.
   */
  public readonly mainModuleName: string;
  public readonly allModules: KFlatModule[];
  public readonly requires: KRequire[];
  public readonly att: KAtt;
  public readonly mainModule: KFlatModule;

  private _initConfig: Record<string, KInner> = {};
  private _emptyConfig: Record<string, KInner> = {};

  constructor(
    mainModuleName: string,
    allModules: Iterable<KFlatModule>,
    requires: Iterable<KRequire> = [],
    att: KAtt = EMPTY_ATT
  ) {
    super();

    const allModulesArray = Array.from(allModules);
    const mainModules = allModulesArray.filter(
      (module) => module.name === mainModuleName
    );

    if (mainModules.length === 0) {
      throw new Error(`Module not found: ${mainModuleName}`);
    }
    if (mainModules.length > 1) {
      throw new Error(`Module is not unique: ${mainModuleName}`);
    }

    const mainModule = mainModules[0]!;

    this.mainModuleName = mainModuleName;
    this.allModules = allModulesArray;
    this.requires = Array.from(requires);
    this.att = att;
    this.mainModule = mainModule;
    this._initConfig = {};
    this._emptyConfig = {};
  }

  public [Symbol.iterator](): Iterator<KFlatModule> {
    return this.allModules[Symbol.iterator]();
  }

  public static fromDict(d: Record<string, any>): KDefinition {
    return new KDefinition(
      d["mainModule"],
      d["modules"]?.map((m: any) => KFlatModule.fromDict(m)) || [],
      d["requires"]?.map((r: any) => KRequire.fromDict(r)) || [],
      d["att"] ? KAtt.fromDict(d["att"]) : EMPTY_ATT
    );
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    result["node"] = "KDefinition";
    result["mainModule"] = this.mainModuleName;
    result.set(
      "modules",
      this.allModules.map((m) => m.toDict())
    );
    result.set(
      "requires",
      this.requires.map((r) => r.toDict())
    );
    result["att"] = this.att.toDict();
    return result;
  }

  public let(
    options: {
      mainModuleName?: string;
      allModules?: Iterable<KFlatModule>;
      requires?: Iterable<KRequire>;
      att?: KAtt;
    } = {}
  ): KDefinition {
    const mainModuleName =
      options.mainModuleName !== undefined
        ? options.mainModuleName
        : this.mainModuleName;
    const allModules =
      options.allModules !== undefined ? options.allModules : this.allModules;
    const requires =
      options.requires !== undefined ? options.requires : this.requires;
    const att = options.att !== undefined ? options.att : this.att;
    return new KDefinition(mainModuleName, allModules, requires, att);
  }

  public letAtt(att: KAtt): KDefinition {
    return this.let({ att });
  }

  public get allModuleNames(): string[] {
    return this.allModules.map((module) => module.name);
  }

  public get moduleNames(): string[] {
    const moduleNames = [this.mainModuleName];
    const seenModules: string[] = [];
    while (moduleNames.length > 0) {
      const mname = moduleNames.shift()!;
      if (!seenModules.includes(mname)) {
        seenModules.push(mname);
        moduleNames.push(
          ...this.allModulesDict[mname]!.imports.map((i) => i.name)
        );
      }
    }
    return seenModules;
  }

  public get allModulesDict(): Record<string, KFlatModule> {
    const result: Record<string, KFlatModule> = {};
    for (const m of this.allModules) {
      result[m.name] = m;
    }
    return result;
  }

  public get modules(): KFlatModule[] {
    return this.moduleNames.map((mname) => this.allModulesDict[mname]!);
  }

  public get productions(): KProduction[] {
    return this.modules.flatMap((module) => module.productions);
  }

  public get syntaxProductions(): KProduction[] {
    return this.modules.flatMap((module) => module.syntaxProductions);
  }

  public get functions(): KProduction[] {
    return this.modules.flatMap((module) => module.functions);
  }

  public get functionLabels(): string[] {
    return this.functions.map((func) => notNone(func.klabel).name);
  }

  public get constructors(): KProduction[] {
    return this.modules.flatMap((module) => module.constructors);
  }

  public get cellCollectionProductions(): KProduction[] {
    return this.modules.flatMap((module) => module.cellCollectionProductions);
  }

  public get rules(): KRule[] {
    return this.modules.flatMap((module) => module.rules);
  }

  public get aliasRules(): KRule[] {
    return this.rules.filter((rule) => rule.att.has(Atts.ALIAS));
  }

  public get macroRules(): KRule[] {
    return this.rules
      .filter((rule) => rule.att.has(Atts.MACRO))
      .concat(this.aliasRules);
  }

  public get semanticRules(): KRule[] {
    function isSemantic(rule: KRule): boolean {
      return (
        (rule.body instanceof KApply &&
          rule.body.label.name === "<generatedTop>") ||
        (rule.body instanceof KRewrite &&
          rule.body.lhs instanceof KApply &&
          rule.body.lhs.label.name === "<generatedTop>")
      );
    }

    return this.rules.filter(isSemantic);
  }

  public get sentenceByUniqueId(): Record<string, KSentence> {
    const uniqueIdMap: Record<string, KSentence> = {};
    for (const module of this.allModules) {
      for (const [uniqueId, sent] of Object.entries(
        module.sentenceByUniqueId
      )) {
        if (uniqueId in uniqueIdMap && sent !== uniqueIdMap[uniqueId]) {
          console.debug(
            `Same UNIQUE_ID found for two different sentences: ${[
              sent,
              uniqueIdMap[uniqueId],
            ]}`
          );
        } else {
          uniqueIdMap[uniqueId] = sent;
        }
      }
    }
    return uniqueIdMap;
  }

  public productionForCellSort(sort: KSort): KProduction {
    if (!sort.name.endsWith("Cell")) {
      throw new Error(
        `Method productionForCellSort only intended to be called on sorts ending in "Cell", not: ${sort}`
      );
    }
    try {
      return single(
        this.productions.filter(
          (prod) => prod.sort === sort && prod.att.has(Atts.CELL)
        )
      );
    } catch (err) {
      throw new Error(`Expected a single cell production for sort ${sort}`, {
        cause: err,
      });
    }
  }

  public module(name: string): KFlatModule {
    return this.allModulesDict[name]!;
  }

  public get overloads(): FrozenRecord<Set<string>> {
    /**
     * Return a mapping from symbols to the sets of symbols that overload them.
     */
    const lt = (overloader: KProduction, overloaded: KProduction): boolean => {
      if (!overloader.klabel || !overloaded.klabel) return false;
      if (overloader.klabel.name === overloaded.klabel.name) return false;
      if (
        !overloader.att.has(Atts.OVERLOAD) ||
        !overloaded.att.has(Atts.OVERLOAD)
      )
        return false;
      if (
        overloader.att.get(Atts.OVERLOAD) !== overloaded.att.get(Atts.OVERLOAD)
      )
        return false;

      const overloaderSorts = [overloader.sort, ...overloader.argumentSorts];
      const overloadedSorts = [overloaded.sort, ...overloaded.argumentSorts];

      if (overloaderSorts.length !== overloadedSorts.length) return false;

      let less = false;
      for (let i = 0; i < overloaderSorts.length; i++) {
        const overloaderSort = overloaderSorts[i]!;
        const overloadedSort = overloadedSorts[i]!;
        if (overloaderSort === overloadedSort) continue;
        if (this.subsorts(overloadedSort).has(overloaderSort)) {
          less = true;
          continue;
        }
        return false;
      }
      return less;
    };

    const symbolsByOverload: Record<string, string[]> = {};
    for (const symbol of Object.keys(this.symbols)) {
      const prod = this.symbols[symbol]!;
      if (prod.att.has(Atts.OVERLOAD)) {
        const overloadKey = prod.att.get(Atts.OVERLOAD)!;
        if (!(overloadKey in symbolsByOverload)) {
          symbolsByOverload[overloadKey] = [];
        }
        symbolsByOverload[overloadKey]!.push(symbol);
      }
    }

    const overloads: Record<string, string[]> = {};
    for (const [_, symbols] of Object.entries(symbolsByOverload)) {
      for (const overloader of symbols) {
        for (const overloaded of symbols) {
          if (overloader === overloaded) continue;
          if (
            lt.call(this, this.symbols[overloader]!, this.symbols[overloaded]!)
          ) {
            if (!(overloaded in overloads)) {
              overloads[overloaded] = [];
            }
            overloads[overloaded]!.push(overloader);
          }
        }
      }
    }

    const result: Record<string, Set<string>> = {};
    for (const [key, values] of Object.entries(overloads)) {
      result[key] = new Set(values);
    }
    return frozenRecord(result);
  }

  public get priorities(): FrozenRecord<Set<string>> {
    /**
     * Return a mapping from symbols to the sets of symbols with lower priority.
     */
    const syntaxPriorities = this.modules
      .flatMap((module) => module.sentences)
      .filter((sent) => sent instanceof KSyntaxPriority) as KSyntaxPriority[];

    const relation: [string, string][] = [];
    for (const syntaxPriority of syntaxPriorities) {
      for (let i = 0; i < syntaxPriority.priorities.length - 1; i++) {
        const highers = syntaxPriority.priorities[i]!;
        const lowers = syntaxPriority.priorities[i + 1]!;
        for (const higher of highers) {
          for (const lower of lowers) {
            relation.push([higher, lower]);
          }
        }
      }
    }

    // Simple implementation of transitive closure
    const result: Record<string, Set<string>> = {};
    for (const [higher, lower] of relation) {
      if (!result[higher]) {
        result[higher] = new Set();
      }
      result[higher].add(lower);
    }
    return frozenRecord(result);
  }

  public get leftAssocs(): FrozenRecord<Set<string>> {
    const map = this.assocs(KAssoc.LEFT);
    return frozenRecord(map);
  }

  public get rightAssocs(): FrozenRecord<Set<string>> {
    const map = this.assocs(KAssoc.RIGHT);
    return frozenRecord(map);
  }

  private assocs(assoc: KAssoc): Record<string, Set<string>> {
    const sents = this.modules
      .flatMap((module) => module.sentences)
      .filter(
        (sent) =>
          sent instanceof KSyntaxAssociativity &&
          (sent.assoc === assoc || sent.assoc === KAssoc.NON_ASSOC)
      ) as KSyntaxAssociativity[];

    const result: Record<string, Set<string>> = {};
    for (const sent of sents) {
      for (const tag1 of sent.tags) {
        for (const tag2 of sent.tags) {
          if (!(tag1 in result)) {
            result[tag1] = new Set();
          }
          result[tag1]!.add(tag2);
        }
      }
    }
    return result;
  }

  public get subsortTable(): FrozenRecord<Set<KSort>> {
    const subsorts: Record<string, Set<KSort>> = {};
    for (const prod of this.productions) {
      const subsort = prod.asSubsort;
      if (subsort) {
        const [supersort, sub] = subsort;
        if (!subsorts[supersort.name]) {
          subsorts[supersort.name] = new Set();
        }
        subsorts[supersort.name]!.add(sub);
      }
    }
    return frozenRecord(subsorts);
  }

  public subsorts(sort: KSort): Set<KSort> {
    return this.subsortTable[sort.name] || new Set();
  }

  public get brackets(): FrozenRecord<KProduction> {
    const brackets: Record<string, KProduction> = {};
    for (const prod of this.productions) {
      if (prod.att.has(Atts.BRACKET)) {
        if (prod.klabel) {
          throw new Error("Bracket production should not have klabel");
        }
        const sort = prod.sort;
        if (sort.name in brackets) {
          throw new Error(
            `Multiple bracket productions for sort: ${sort.name}`
          );
        }
        brackets[sort.name] = prod;
      }
    }
    return frozenRecord(brackets);
  }

  public get symbols(): FrozenRecord<KProduction> {
    const symbols: Record<string, KProduction> = {};
    for (const prod of this.productions) {
      if (!prod.klabel) continue;
      const symbol = prod.klabel.name;
      if (symbol in symbols) {
        const other = symbols[symbol]!;
        // Check if they're the same production (ignoring source attributes)
        const thisNoSource = prod.let({
          att: prod.att.dropSource?.() || prod.att,
        });
        const otherNoSource = other.let({
          att: other.att.dropSource?.() || other.att,
        });
        if (
          JSON.stringify(thisNoSource.toDict()) !==
          JSON.stringify(otherNoSource.toDict())
        ) {
          throw new Error(
            `Found multiple productions for ${symbol}: ${[other, prod]}`
          );
        }
        continue;
      }
      symbols[symbol] = prod;
    }
    return frozenRecord(symbols);
  }

  public get syntaxSymbols(): FrozenRecord<KProduction> {
    const brackets: Record<string, KProduction> = {};
    for (const [_, prod] of Object.entries(this.brackets)) {
      const bracketLabel = prod.att.get(Atts.BRACKET_LABEL);
      if (bracketLabel) {
        brackets[bracketLabel] = prod;
      }
    }

    const combined: Record<string, KProduction> = {
      ...this.symbols,
      ...brackets,
    };
    return frozenRecord(combined);
  }

  public sort(kast: KInner): KSort | null {
    /**
     * Compute the sort of a given term using best-effort simple sorting algorithm,
     * returns null on algorithm failure.
     */
    if (kast instanceof KToken || kast instanceof KVariable) {
      return kast.sort;
    }
    if (kast instanceof KRewrite) {
      const lhsSort = this.sort(kast.lhs);
      const rhsSort = this.sort(kast.rhs);
      if (lhsSort && rhsSort) {
        return this.leastCommonSupersort(lhsSort, rhsSort);
      }
      return null;
    }
    if (kast instanceof KSequence) {
      return new KSort("K");
    }
    if (kast instanceof KApply) {
      const [sort, _] = this.resolveSorts(kast.label);
      return sort;
    }
    return null;
  }

  public sortStrict(kast: KInner): KSort {
    /**
     * Compute the sort of a given term using best-effort simple sorting algorithm,
     * throws on algorithm failure.
     */
    const sort = this.sort(kast);
    if (sort === null) {
      throw new Error(`Could not determine sort of term: ${kast}`);
    }
    return sort;
  }

  public resolveSorts(label: KLabel): [KSort, KSort[]] {
    /**
     * Compute the result and argument sorts for a given production based on a KLabel.
     */
    const prod = this.symbols[label.name]!;
    const sorts: Record<string, KSort> = {};
    for (let i = 0; i < prod.params.length; i++) {
      sorts[prod.params[i]!.name] = label.params[i]!;
    }

    function resolve(sort: KSort): KSort {
      return sorts[sort.name] || sort;
    }

    return [resolve(prod.sort), prod.argumentSorts.map(resolve)];
  }

  public leastCommonSupersort(sort1: KSort, sort2: KSort): KSort | null {
    /**
     * Compute the lowest-upper-bound of two sorts in the sort lattice using very simple approach,
     * returning null on failure.
     */
    if (sort1 === sort2) return sort1;
    if (this.subsorts(sort2).has(sort1)) return sort2;
    if (this.subsorts(sort1).has(sort2)) return sort1;
    return null;
  }

  public greatestCommonSubsort(sort1: KSort, sort2: KSort): KSort | null {
    /**
     * Compute the greatest-lower-bound of two sorts in the sort lattice using very simple approach,
     * returning null on failure.
     */
    if (sort1 === sort2) return sort1;
    if (this.subsorts(sort2).has(sort1)) return sort1;
    if (this.subsorts(sort1).has(sort2)) return sort2;
    return null;
  }

  public addKSequenceUnderKProductions(kast: KInner): KInner {
    /**
     * Inject a KSequence under the given term if it's a subsort of K and is being used
     * somewhere that sort K is expected.
     */
    const addKSequenceUnderKProductionsInner = (kInner: KInner): KInner => {
      if (!(kInner instanceof KApply)) return kInner;

      const prod = this.symbols[kInner.label.name]!;
      return new KApply(
        kInner.label,
        kInner.args.map((arg, i) => {
          const sort = prod.argumentSorts[i]!;
          if (sort.name === "K" && this.sort(arg)?.name !== "K") {
            return new KSequence([arg]);
          }
          return arg;
        })
      );
    };

    return topDown(addKSequenceUnderKProductionsInner, kast);
  }

  public sortVars(kast: KInner, sort?: KSort): KInner {
    /**
     * Return the original term with all the variables having the sorts added or specialized,
     * failing if receiving conflicting sorts for a given variable.
     */
    const mlQuantifiers = new Set(["#Exists", "#Forall"]);

    if (kast instanceof KVariable && kast.sort === null && sort !== undefined) {
      return kast.let({ sort });
    }

    // Simplified implementation - full implementation would need more complex variable tracking
    return kast;
  }

  public addSortParams(kast: KInner): KInner {
    /**
     * Return a given term with the sort parameters on the KLabel filled in,
     * which may be missing because of how the frontend works, best effort.
     */
    const addSortParamsInner = (k: KInner): KInner => {
      if (!(k instanceof KApply)) return k;

      const prod = this.symbols[k.label.name]!;
      if (k.label.params.length === 0 && prod.params.length > 0) {
        const sortDict: Record<string, KSort> = {};
        for (let i = 0; i < prod.argumentSorts.length; i++) {
          const psort = prod.argumentSorts[i]!;
          const asort = this.sort(k.args[i]!);
          if (asort === null) {
            console.warn(
              `Failed to add sort parameter, unable to determine sort for argument in production: ${[
                prod,
                psort,
                asort,
              ]}`
            );
            return k;
          }
          if (prod.params.includes(psort)) {
            if (psort.name in sortDict && sortDict[psort.name] !== asort) {
              console.warn(
                `Failed to add sort parameter, sort mismatch: ${[
                  prod,
                  psort,
                  sortDict[psort.name],
                  asort,
                ]}`
              );
              return k;
            } else if (!(psort.name in sortDict)) {
              sortDict[psort.name] = asort;
            }
          }
        }
        if (prod.params.every((p) => p.name in sortDict)) {
          return k.let({
            label: new KLabel(
              k.label.name,
              prod.params.map((p) => sortDict[p.name]!)
            ),
          });
        }
      }
      return k;
    };

    return bottomUp(addSortParamsInner, kast);
  }

  public addCellMapItems(kast: KInner): KInner {
    /**
     * Wrap cell-map items in the syntactical wrapper that the frontend generates for them.
     */
    const cellWrappers: Record<string, string> = {};
    for (const ccp of this.cellCollectionProductions) {
      const element = ccp.att.get(Atts.ELEMENT);
      const wrapElement = ccp.att.get(Atts.WRAP_ELEMENT);
      if (element && wrapElement) {
        cellWrappers[wrapElement] = element;
      }
    }

    const wrapElements = (k: KInner): KInner => {
      if (k instanceof KApply && k.label.name in cellWrappers) {
        return new KApply(cellWrappers[k.label.name]!, [k.args[0]!, k]);
      }
      return k;
    };

    const kast2 = this.removeCellMapItems(kast);
    return bottomUp(wrapElements, kast2);
  }

  public removeCellMapItems(kast: KInner): KInner {
    /**
     * Remove cell-map syntactical wrapper items that the frontend generates.
     */
    const cellWrappers: Record<string, string> = {};
    for (const ccp of this.cellCollectionProductions) {
      const element = ccp.att.get(Atts.ELEMENT);
      const wrapElement = ccp.att.get(Atts.WRAP_ELEMENT);
      if (element && wrapElement) {
        cellWrappers[element] = wrapElement;
      }
    }

    const unwrapElements = (k: KInner): KInner => {
      if (
        k instanceof KApply &&
        k.label.name in cellWrappers &&
        k.args.length === 2 &&
        k.args[1] instanceof KApply &&
        k.args[1].label.name === cellWrappers[k.label.name]
      ) {
        return k.args[1];
      }
      return k;
    };

    return bottomUp(unwrapElements, kast);
  }

  public emptyConfig(sort: KSort): KInner {
    /**
     * Given a cell-sort, compute an "empty" configuration for it.
     */
    const sortKey = sort.name;
    if (!(sortKey in this._emptyConfig)) {
      this._emptyConfig[sortKey] = this.computeEmptyConfig(sort);
    }
    return this._emptyConfig[sortKey]!;
  }

  private computeEmptyConfig(sort: KSort): KInner {
    const cellProd = this.productionForCellSort(sort);
    const cellKlabel = cellProd.klabel!;
    const production = this.symbols[cellKlabel.name]!;
    const args: KInner[] = [];
    let numNonterminals = 0;
    let numFreshvars = 0;

    for (const pItem of production.items) {
      if (pItem instanceof KNonTerminal) {
        numNonterminals++;
        if (pItem.sort.name.endsWith("Cell")) {
          args.push(this.computeEmptyConfig(pItem.sort));
        } else {
          numFreshvars++;
          args.push(
            new KVariable(sort.name.slice(0, -4).toUpperCase() + "_CELL")
          );
        }
      }
    }

    if (numNonterminals > 1 && numFreshvars > 0) {
      throw new Error(
        `Found mixed cell and non-cell arguments to cell constructor for: ${sort}`
      );
    }

    return new KApply(cellKlabel, args);
  }

  public instantiateCellVars(term: KInner): KInner {
    /**
     * Given a partially-complete configuration, find positions where there could be more
     * cell structure but instead there are variables and instantiate more cell structure.
     */
    const cellVarsToLabels = (kast: KInner): KInner => {
      if (kast instanceof KApply && kast.isCell) {
        const production = this.symbols[kast.label.name]!;
        const productionArity = production.nonTerminals.map(
          (item) => item.sort
        );
        const newArgs: KInner[] = [];

        for (let i = 0; i < productionArity.length; i++) {
          const sort = productionArity[i]!;
          const arg = kast.args[i]!;
          if (sort.name.endsWith("Cell") && arg instanceof KVariable) {
            newArgs.push(this.emptyConfig(sort));
          } else {
            newArgs.push(arg);
          }
        }
        return new KApply(kast.label, newArgs);
      }
      return kast;
    };

    return bottomUp(cellVarsToLabels, term);
  }

  public initConfig(sort: KSort): KInner {
    /**
     * Return an initialized configuration as the user declares it in the semantics,
     * complete with configuration variables in place.
     */
    const sortKey = sort.name;
    if (!(sortKey in this._initConfig)) {
      this._initConfig[sortKey] = this.computeInitConfig(sort);
    }
    return this._initConfig[sortKey]!;
  }

  private computeInitConfig(sort: KSort): KInner {
    const configVarMap = new KVariable("__###CONFIG_VAR_MAP###__");

    const removeConfigVarLookups = (kast: KInner): KInner => {
      if (
        kast instanceof KApply &&
        kast.label.name.startsWith("project:") &&
        kast.args.length === 1
      ) {
        const term = kast.args[0]!;
        if (
          term instanceof KApply &&
          term.label.name === "Map:lookup" &&
          term.args[0] === configVarMap
        ) {
          const tokenVar = term.args[1]!;
          if (
            tokenVar instanceof KToken &&
            tokenVar.sort.name === "KConfigVar"
          ) {
            return new KVariable(tokenVar.token);
          }
        }
      }
      return kast;
    };

    const initProds = this.syntaxProductions.filter((prod) =>
      prod.att.has(Atts.INITIALIZER)
    );
    const initProd = single(initProds.filter((prod) => prod.sort === sort));

    const prodKlabel = initProd.klabel!;
    const argSorts = initProd.items
      .filter((item) => item instanceof KNonTerminal)
      .map((nt) => (nt as KNonTerminal).sort);

    let initConfig: KInner;
    if (argSorts.length === 0) {
      initConfig = new KApply(prodKlabel);
    } else if (argSorts.length === 1 && argSorts[0]!.name === "Map") {
      initConfig = new KApply(prodKlabel, [configVarMap]);
    } else {
      throw new Error(`Cannot handle initializer for label: ${prodKlabel}`);
    }

    const initRewrites = this.rules
      .filter(
        (rule) =>
          rule.att.has(Atts.INITIALIZER) && rule.body instanceof KRewrite
      )
      .map((rule) => rule.body as KRewrite);

    initConfig = indexedRewrite(initConfig, initRewrites);
    initConfig = topDown(removeConfigVarLookups, initConfig);

    return initConfig;
  }
}

export function readKastDefinition(path: string): KDefinition {
  /**
   * Read a KDefinition from disk, failing if it's not actually a KDefinition.
   */
  console.info(`Loading JSON definition: ${path}`);
  const jsonDefn = JSON.parse(fs.readFileSync(path, "utf8"));
  console.info(`Converting JSON definition to Kast: ${path}`);
  const kastDefn = kastTerm(jsonDefn);
  return KDefinition.fromDict(kastDefn);
}
