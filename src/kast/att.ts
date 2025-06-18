import { FrozenDict } from "../utils";
import { Color } from "./color";
import { KAst } from "./kast";

// Generic type variables
export type AttValue = any;

export abstract class AttType<T> {
  public abstract fromDict(obj: any): T;
  public abstract toDict(value: T): any;
  public abstract unparse(value: T): string | null;
  public abstract parse(text: string): T;
}

export class NoneType extends AttType<null> {
  public fromDict(obj: any): null {
    if (obj !== "") {
      throw new Error(`Expected empty string for NoneType, got: ${obj}`);
    }
    return null;
  }

  public toDict(value: null): string {
    if (value !== null) {
      throw new Error(`Expected null for NoneType, got: ${value}`);
    }
    return "";
  }

  public unparse(value: null): null {
    return null;
  }

  public parse(text: string): null {
    if (text !== "") {
      throw new Error(`Expected empty string for NoneType, got: ${text}`);
    }
    return null;
  }
}

export class OptionalType<T> extends AttType<T | null> {
  private valueType: AttType<T>;

  constructor(valueType: AttType<T>) {
    super();
    this.valueType = valueType;
  }

  public fromDict(obj: any): T | null {
    if (obj === "") {
      return null;
    }
    return this.valueType.fromDict(obj);
  }

  public toDict(value: T | null): any {
    if (value === null) {
      return "";
    }
    return this.valueType.toDict(value);
  }

  public unparse(value: T | null): string | null {
    if (value === null) {
      return null;
    }
    return this.valueType.unparse(value);
  }

  public parse(text: string): T | null {
    if (text === "") {
      return null;
    }
    return this.valueType.parse(text);
  }
}

export class AnyType extends AttType<any> {
  public fromDict(obj: any): any {
    return this.freeze(obj);
  }

  public toDict(value: any): any {
    return this.unfreeze(value);
  }

  public unparse(value: any): string {
    return String(value);
  }

  public parse(text: string): any {
    throw new Error(
      `Parsing a string into an Any attribute type is not supported. Attempted to parse: ${text}`
    );
  }

  private freeze(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((v) => this.freeze(v));
    }
    if (obj && typeof obj === "object" && obj.constructor === Object) {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(obj)) {
        result[k] = this.freeze(v);
      }
      return new FrozenDict(result);
    }
    return obj;
  }

  private unfreeze(value: any): any {
    if (Array.isArray(value)) {
      return value.map((v) => this.unfreeze(v));
    }
    if (value instanceof FrozenDict) {
      const result: Record<string, any> = {};
      for (const [k, v] of value.entries()) {
        result[k] = this.unfreeze(v);
      }
      return result;
    }
    return value;
  }
}

export class IntType extends AttType<number> {
  public fromDict(obj: any): number {
    if (typeof obj !== "string") {
      throw new Error(`Expected string for IntType, got: ${typeof obj}`);
    }
    return parseInt(obj, 10);
  }

  public toDict(value: number): string {
    return String(value);
  }

  public unparse(value: number): string {
    return String(value);
  }

  public parse(text: string): number {
    return parseInt(text, 10);
  }
}

export class StrType extends AttType<string> {
  public fromDict(obj: any): string {
    if (typeof obj !== "string") {
      throw new Error(`Expected string for StrType, got: ${typeof obj}`);
    }
    return obj;
  }

  public toDict(value: string): string {
    return value;
  }

  public unparse(value: string): string {
    return `"${value}"`;
  }

  public parse(text: string): string {
    return text;
  }
}

export class LocationType extends AttType<[number, number, number, number]> {
  private static readonly PARSE_REGEX = /^(\d+),(\d+),(\d+),(\d+)$/;

  public fromDict(obj: any): [number, number, number, number] {
    if (!Array.isArray(obj) || obj.length !== 4) {
      throw new Error(
        `Expected array of 4 numbers for LocationType, got: ${obj}`
      );
    }
    const [a, b, c, d] = obj;
    if (
      typeof a !== "number" ||
      typeof b !== "number" ||
      typeof c !== "number" ||
      typeof d !== "number"
    ) {
      throw new Error(
        `Expected array of 4 numbers for LocationType, got: ${obj}`
      );
    }
    return [a, b, c, d];
  }

  public toDict(value: [number, number, number, number]): number[] {
    return Array.from(value);
  }

  public unparse(value: [number, number, number, number]): string {
    return value.join(",");
  }

  public parse(text: string): [number, number, number, number] {
    const match = LocationType.PARSE_REGEX.exec(text);
    if (!match) {
      throw new Error(`Invalid location format: ${text}`);
    }
    const [, a, b, c, d] = match;
    return [
      parseInt(a!, 10),
      parseInt(b!, 10),
      parseInt(c!, 10),
      parseInt(d!, 10),
    ];
  }
}

export class PathType extends AttType<string> {
  public fromDict(obj: any): string {
    if (typeof obj !== "string") {
      throw new Error(`Expected string for PathType, got: ${typeof obj}`);
    }
    return obj;
  }

  public toDict(value: string): string {
    return value;
  }

  public unparse(value: string): string {
    return `"${value}"`;
  }

  public parse(text: string): string {
    return text;
  }
}

export class Format {
  public readonly tokens: string[];
  private static readonly PATTERN = /%\D|%\d+|[^%]+/g;

  constructor(tokens: Iterable<string> = []) {
    this.tokens = Array.from(tokens);
  }

  public static parse(s: string): Format {
    const matches = Array.from(s.matchAll(Format.PATTERN));

    const matchedLen =
      matches.length > 0
        ? matches[matches.length - 1]!.index! +
          matches[matches.length - 1]![0].length
        : 0;

    if (matchedLen !== s.length) {
      if (s && s[s.length - 1] === "%") {
        throw new Error(
          `Incomplete escape sequence at the end of format string: ${s}`
        );
      }
    }

    return new Format(matches.map((m) => m[0]));
  }

  public unparse(): string {
    return this.tokens.join("");
  }
}

export class FormatType extends AttType<Format> {
  public fromDict(obj: any): Format {
    if (typeof obj !== "string") {
      throw new Error(`Expected string for FormatType, got: ${typeof obj}`);
    }
    return Format.parse(obj);
  }

  public toDict(value: Format): string {
    return value.unparse();
  }

  public unparse(value: Format): string {
    return `"${value.unparse()}"`;
  }

  public parse(text: string): Format {
    return Format.parse(text);
  }
}

export class ColorType extends AttType<Color> {
  public fromDict(obj: any): Color {
    if (typeof obj !== "string") {
      throw new Error(`Expected string for ColorType, got: ${typeof obj}`);
    }
    return obj as Color;
  }

  public toDict(value: Color): string {
    return value;
  }

  public unparse(value: Color): string {
    return value;
  }

  public parse(text: string): Color {
    return text as Color;
  }
}

export class ColorsType extends AttType<Color[]> {
  public fromDict(obj: any): Color[] {
    if (typeof obj !== "string") {
      throw new Error(`Expected string for ColorsType, got: ${typeof obj}`);
    }
    return this.parse(obj);
  }

  public toDict(value: Color[]): string {
    return this.unparse(value);
  }

  public unparse(value: Color[]): string {
    return value.join(",");
  }

  public parse(text: string): Color[] {
    return text.replace(/\s/g, "").split(",") as Color[];
  }
}

// Singleton instances
const _NONE = new NoneType();
const _ANY = new AnyType();
const _INT = new IntType();
const _STR = new StrType();
const _LOCATION = new LocationType();
const _PATH = new PathType();

export class AttKey<T = any> {
  public readonly name: string;
  public readonly type: AttType<T>;

  constructor(name: string, type: AttType<T> = _ANY as AttType<T>) {
    this.name = name;
    this.type = type;
  }

  public call(value: T): AttEntry<T> {
    return new AttEntry(this, value);
  }
}

export class AttEntry<T = any> {
  public readonly key: AttKey<T>;
  public readonly value: T;

  constructor(key: AttKey<T>, value: T) {
    this.key = key;
    this.value = value;
  }
}

export class Atts {
  public static readonly ALIAS = new AttKey("alias", _NONE);
  public static readonly ALIAS_REC = new AttKey("alias-rec", _NONE);
  public static readonly ANYWHERE = new AttKey("anywhere", _NONE);
  public static readonly ASSOC = new AttKey("assoc", _NONE);
  public static readonly AVOID = new AttKey("avoid", _NONE);
  public static readonly BRACKET = new AttKey("bracket", _NONE);
  public static readonly BRACKET_LABEL = new AttKey("bracketLabel", _ANY);
  public static readonly CIRCULARITY = new AttKey("circularity", _NONE);
  public static readonly CELL = new AttKey("cell", _NONE);
  public static readonly CELL_COLLECTION = new AttKey("cellCollection", _NONE);
  public static readonly CELL_FRAGMENT = new AttKey("cellFragment", _ANY);
  public static readonly CELL_NAME = new AttKey("cellName", _STR);
  public static readonly CELL_OPT_ABSENT = new AttKey("cellOptAbsent", _ANY);
  public static readonly COLOR = new AttKey("color", new ColorType());
  public static readonly COLORS = new AttKey("colors", new ColorsType());
  public static readonly COMM = new AttKey("comm", _NONE);
  public static readonly CONCAT = new AttKey("concat", _ANY);
  public static readonly CONCRETE = new AttKey(
    "concrete",
    new OptionalType(_STR)
  );
  public static readonly CONSTRUCTOR = new AttKey("constructor", _NONE);
  public static readonly DEPENDS = new AttKey("depends", _ANY);
  public static readonly DIGEST = new AttKey("digest", _ANY);
  public static readonly ELEMENT = new AttKey("element", _ANY);
  public static readonly EXIT = new AttKey("exit", _ANY);
  public static readonly FORMAT = new AttKey("format", new FormatType());
  public static readonly FRESH_GENERATOR = new AttKey("freshGenerator", _NONE);
  public static readonly FUNCTION = new AttKey("function", _NONE);
  public static readonly FUNCTIONAL = new AttKey("functional", _NONE);
  public static readonly GROUP = new AttKey("group", _STR);
  public static readonly HAS_DOMAIN_VALUES = new AttKey(
    "hasDomainValues",
    _NONE
  );
  public static readonly HOOK = new AttKey("hook", _ANY);
  public static readonly IDEM = new AttKey("idem", _NONE);
  public static readonly IMPURE = new AttKey("impure", _NONE);
  public static readonly INDEX = new AttKey("index", _INT);
  public static readonly INITIALIZER = new AttKey("initializer", _NONE);
  public static readonly INJECTIVE = new AttKey("injective", _NONE);
  public static readonly LABEL = new AttKey("label", _ANY);
  public static readonly LEFT = new AttKey("left", _ANY);
  public static readonly LOCATION = new AttKey(
    "org.kframework.attributes.Location",
    _LOCATION
  );
  public static readonly MACRO = new AttKey("macro", _NONE);
  public static readonly MACRO_REC = new AttKey("macro-rec", _NONE);
  public static readonly MAINCELL = new AttKey("maincell", _NONE);
  public static readonly MULTIPLICITY = new AttKey("multiplicity", _ANY);
  public static readonly NO_EVALUATORS = new AttKey("no-evaluators", _NONE);
  public static readonly OVERLOAD = new AttKey("overload", _STR);
  public static readonly OWISE = new AttKey("owise", _NONE);
  public static readonly PREDICATE = new AttKey("predicate", _ANY);
  public static readonly PREFER = new AttKey("prefer", _NONE);
  public static readonly PRIORITY = new AttKey("priority", _ANY);
  public static readonly PRIORITIES = new AttKey("priorities", _ANY);
  public static readonly PRIVATE = new AttKey("private", _NONE);
  public static readonly PRODUCTION = new AttKey(
    "org.kframework.definition.Production",
    _ANY
  );
  public static readonly PROJECTION = new AttKey("projection", _NONE);
  public static readonly RIGHT = new AttKey("right", _ANY);
  public static readonly RETURNS_UNIT = new AttKey("returnsUnit", _NONE);
  public static readonly SIMPLIFICATION = new AttKey("simplification", _ANY);
  public static readonly SEQSTRICT = new AttKey("seqstrict", _ANY);
  public static readonly SORT = new AttKey("org.kframework.kore.Sort", _ANY);
  public static readonly SOURCE = new AttKey(
    "org.kframework.attributes.Source",
    _PATH
  );
  public static readonly SMTLEMMA = new AttKey("smt-lemma", _NONE);
  public static readonly STRICT = new AttKey("strict", _ANY);
  public static readonly SYMBOL = new AttKey("symbol", _STR);
  public static readonly SYNTAX_MODULE = new AttKey("syntaxModule", _STR);
  public static readonly SYMBOLIC = new AttKey(
    "symbolic",
    new OptionalType(_STR)
  );
  public static readonly TERMINALS = new AttKey("terminals", _STR);
  public static readonly TERMINATOR_SYMBOL = new AttKey(
    "terminator-symbol",
    _ANY
  );
  public static readonly TOKEN = new AttKey("token", _NONE);
  public static readonly TOTAL = new AttKey("total", _NONE);
  public static readonly TRUSTED = new AttKey("trusted", _NONE);
  public static readonly TYPE = new AttKey("type", _ANY);
  public static readonly UNIT = new AttKey("unit", _STR);
  public static readonly UNIQUE_ID = new AttKey("UNIQUE_ID", _ANY);
  public static readonly UNPARSE_AVOID = new AttKey("unparseAvoid", _NONE);
  public static readonly UPDATE = new AttKey("update", _ANY);
  public static readonly USER_LIST = new AttKey("userList", _ANY);
  public static readonly WRAP_ELEMENT = new AttKey("wrapElement", _ANY);

  private static _keys: FrozenDict<string, AttKey> | null = null;

  public static keys(): FrozenDict<string, AttKey> {
    if (Atts._keys === null) {
      const keyEntries: [string, AttKey][] = [];

      // Get all static properties that are AttKey instances
      for (const [propName, propValue] of Object.entries(Atts)) {
        if (propValue instanceof AttKey) {
          keyEntries.push([propValue.name, propValue]);
        }
      }

      Atts._keys = new FrozenDict(keyEntries);
    }
    return Atts._keys;
  }
}

export class KAtt extends KAst implements Map<AttKey, any> {
  public readonly atts: FrozenDict<AttKey, any>;

  constructor(entries: Iterable<AttEntry> = []) {
    super();
    const attEntries: [AttKey, any][] = [];
    for (const entry of entries) {
      attEntries.push([entry.key, entry.value]);
    }
    this.atts = new FrozenDict(attEntries);
  }

  [Symbol.toStringTag]: string;

  public get size(): number {
    return this.atts.size;
  }

  public get(key: AttKey): any {
    return this.atts.get(key);
  }

  public has(key: AttKey): boolean {
    return this.atts.has(key);
  }

  public keys(): MapIterator<AttKey> {
    return this.atts.keys();
  }

  public values(): MapIterator<any> {
    return this.atts.values();
  }

  public entries(): MapIterator<[AttKey, any]> {
    return this.atts.entries();
  }

  public forEach(
    callbackfn: (value: any, key: AttKey, map: Map<AttKey, any>) => void,
    thisArg?: any
  ): void {
    this.atts.forEach(callbackfn, thisArg);
  }

  public [Symbol.iterator](): MapIterator<[AttKey, any]> {
    return this.atts[Symbol.iterator]();
  }

  public set(key: AttKey, value: any): this {
    throw new Error("KAtt is immutable");
  }

  public delete(key: AttKey): boolean {
    throw new Error("KAtt is immutable");
  }

  public clear(): void {
    throw new Error("KAtt is immutable");
  }

  public attEntries(): Generator<AttEntry> {
    return (function* (atts) {
      for (const [key, value] of atts.entries()) {
        yield new AttEntry(key, value);
      }
    })(this.atts);
  }

  public static fromDict(d: Map<string, any>): KAtt {
    const entries: AttEntry[] = [];
    const attDict = d.get("att") || new Map();

    for (const [k, v] of attDict.entries()) {
      const key = Atts.keys().get(k) || new AttKey(k, _ANY);
      const value = key.type.fromDict(v);
      entries.push(new AttEntry(key, value));
    }

    return new KAtt(entries);
  }

  public toDict(): Map<string, any> {
    const attMap = new Map<string, any>();
    for (const [key, value] of this.atts.entries()) {
      attMap.set(key.name, key.type.toDict(value));
    }
    const result = new Map<string, any>();
    result.set("node", "KAtt");
    result.set("att", attMap);
    return result;
  }

  public static parse(d: Map<string, string>): KAtt {
    const entries: AttEntry[] = [];

    for (const [k, v] of d.entries()) {
      const key = Atts.keys().get(k) || new AttKey(k, _ANY);
      const value = key.type.parse(v);
      entries.push(new AttEntry(key, value));
    }

    return new KAtt(entries);
  }

  public get pretty(): string {
    if (this.size === 0) {
      return "";
    }

    const attStrs: string[] = [];
    for (const [key, value] of this.atts.entries()) {
      const valueStr = key.type.unparse(value);
      if (valueStr === null) {
        attStrs.push(key.name);
      } else {
        attStrs.push(`${key.name}(${valueStr})`);
      }
    }

    return `[${attStrs.join(", ")}]`;
  }

  public update(entries: Iterable<AttEntry>): KAtt {
    const allEntries: AttEntry[] = [];

    // Add existing entries
    for (const entry of this.attEntries()) {
      allEntries.push(entry);
    }

    // Add new entries
    for (const entry of entries) {
      allEntries.push(entry);
    }

    return new KAtt(allEntries);
  }

  public discard(keys: Set<AttKey> | AttKey[]): KAtt {
    const keySet = Array.isArray(keys) ? new Set(keys) : keys;
    const entries: AttEntry[] = [];

    for (const [key, value] of this.atts.entries()) {
      if (!keySet.has(key)) {
        entries.push(new AttEntry(key, value));
      }
    }

    return new KAtt(entries);
  }

  public dropSource(): KAtt {
    return this.discard([Atts.SOURCE, Atts.LOCATION]);
  }
}

export const EMPTY_ATT = new KAtt();

export interface WithKAtt {
  readonly att: KAtt;
  letAtt(att: KAtt): WithKAtt;
}

export function mapAtt<T extends WithKAtt>(obj: T, f: (att: KAtt) => KAtt): T {
  return obj.letAtt(f(obj.att)) as T;
}

export function updateAtts<T extends WithKAtt>(
  obj: T,
  entries: Iterable<AttEntry>
): T {
  return obj.letAtt(obj.att.update(entries)) as T;
}
