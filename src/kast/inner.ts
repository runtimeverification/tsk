import { KAst } from "./kast";

export class KSort extends KAst {
  /**
   * Store a simple sort name.
   */
  public readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  public static fromDict(d: Record<string, any>): KSort {
    return new KSort(d.name);
  }

  public toDict(): Record<string, any> {
    return {
      node: "KSort",
      name: this.name,
    };
  }

  public let(name?: string | null): KSort {
    const name_ = name ?? this.name;
    return new KSort(name_);
  }
}

export class KLabel extends KAst {
  /**
   * Represents a symbol that can be applied in a K AST, potentially with sort parameters.
   */
  public readonly name: string;
  public readonly params: KSort[];

  constructor(name: string, ...args: any[]) {
    super();

    let params: (string | KSort)[];

    if (args.length === 1 && Array.isArray(args[0])) {
      params = args[0];
    } else {
      params = args;
    }

    this.name = name;
    this.params = params.map((param) =>
      typeof param === "string" ? new KSort(param) : param
    );
  }

  public static fromDict(d: Record<string, any>): KLabel {
    return new KLabel(
      d.name,
      d.params.map((param: any) => KSort.fromDict(param))
    );
  }

  public toDict(): Record<string, any> {
    return {
      node: "KLabel",
      name: this.name,
      params: this.params.map((param) => param.toDict()),
    };
  }

  public let(
    options: { name?: string; params?: (string | KSort)[] } = {}
  ): KLabel {
    const name = options.name ?? this.name;
    const params = options.params ?? this.params;
    return new KLabel(name, params);
  }

  public apply(...args: KInner[]): KApply {
    return new KApply(this, args);
  }
}

export abstract class KInner extends KAst {
  private static readonly NODES = new Set([
    "KVariable",
    "KToken",
    "KApply",
    "KAs",
    "KRewrite",
    "KSequence",
  ]);

  public static fromJson(s: string): KInner {
    return KInner.fromDict(JSON.parse(s));
  }

  public static async fromJsonAsync(
    s: string,
    yieldFrequency = 10
  ): Promise<KInner> {
    return KInner.fromDictAsync(JSON.parse(s), 0, yieldFrequency);
  }

  // Async version to break up call stack using Promises
  public static async fromDictAsync(
    dct: Record<string, any>,
    depth = 0,
    yieldFrequency = 10
  ): Promise<KInner> {
    // Every yieldFrequency levels, yield control to prevent stack overflow
    if (depth % yieldFrequency === 0 && depth > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const nodeType = dct.node;
    switch (nodeType) {
      case "KToken":
        return KToken._fromDict(dct, []);
      case "KVariable":
        return KVariable._fromDict(dct, []);
      case "KApply":
        const args = await Promise.all(
          (dct.args || []).map((arg: any) =>
            KInner.fromDictAsync(arg, depth + 1, yieldFrequency)
          )
        );
        return KApply._fromDict(dct, args);
      case "KSequence":
        const items = await Promise.all(
          (dct.items || []).map((item: any) =>
            KInner.fromDictAsync(item, depth + 1, yieldFrequency)
          )
        );
        return KSequence._fromDict(dct, items);
      case "KRewrite":
        const [lhs, rhs] = await Promise.all([
          KInner.fromDictAsync(dct.lhs, depth + 1, yieldFrequency),
          KInner.fromDictAsync(dct.rhs, depth + 1, yieldFrequency),
        ]);
        return KRewrite._fromDict(dct, [lhs, rhs]);
      case "KAs":
        const [pattern, alias] = await Promise.all([
          KInner.fromDictAsync(dct.pattern, depth + 1, yieldFrequency),
          KInner.fromDictAsync(dct.alias, depth + 1, yieldFrequency),
        ]);
        return KAs._fromDict(dct, [pattern, alias]);
      default:
        throw new Error(`Unknown node type: ${nodeType}`);
    }
  }

  public static fromDict(dct: Record<string, any>): KInner {
    // Simplified implementation - in practice would need full parsing logic
    const nodeType = dct.node;
    switch (nodeType) {
      case "KToken":
        return KToken._fromDict(dct, []);
      case "KVariable":
        return KVariable._fromDict(dct, []);
      case "KApply":
        const args = dct.args?.map((arg: any) => KInner.fromDict(arg)) || [];
        return KApply._fromDict(dct, args);
      case "KSequence":
        const items =
          dct.items?.map((item: any) => KInner.fromDict(item)) || [];
        return KSequence._fromDict(dct, items);
      case "KRewrite":
        const lhs = KInner.fromDict(dct.lhs);
        const rhs = KInner.fromDict(dct.rhs);
        return KRewrite._fromDict(dct, [lhs, rhs]);
      case "KAs":
        const pattern = KInner.fromDict(dct.pattern);
        const alias = KInner.fromDict(dct.alias);
        return KAs._fromDict(dct, [pattern, alias]);
      default:
        throw new Error(`Unknown node type: ${nodeType}`);
    }
  }

  /*
  FIXME: typescript doesn't support abstract static methods,
  public static abstract _fromDict(
    dct: Map<string, any>,
    terms: KInner[]
  ): KInner;
  */
  public abstract get terms(): KInner[];
  public abstract letTerms(terms: KInner[]): KInner;
  public abstract match(term: KInner): Subst | null;
  public abstract _toDict(terms: Record<string, any>[]): Record<string, any>;

  public mapInner(f: (term: KInner) => KInner): KInner {
    return this.letTerms(this.terms.map(f));
  }

  public toDict(): Record<string, any> {
    const termDicts = this.terms.map((term) => term.toDict());
    return this._toDict(termDicts);
  }

  protected static combineMatches(substs: (Subst | null)[]): Subst | null {
    let result: Subst | null = new Subst();

    for (const subst of substs) {
      if (subst === null || result === null) {
        return null;
      }
      result = result.union(subst);
      if (result === null) {
        return null;
      }
    }

    return result;
  }
}

export class KToken extends KInner {
  public readonly token: string;
  public readonly sort: KSort;

  constructor(token: string, sort: string | KSort) {
    super();
    this.token = token;
    this.sort = typeof sort === "string" ? new KSort(sort) : sort;
  }

  public static _fromDict(dct: Record<string, any>, terms: KInner[]): KToken {
    return new KToken(dct.token, KSort.fromDict(dct.sort));
  }

  public _toDict(terms: Record<string, any>[]): Record<string, any> {
    return {
      node: "KToken",
      token: this.token,
      sort: this.sort.toDict(),
    };
  }

  public let(options: { token?: string; sort?: string | KSort } = {}): KToken {
    const token = options.token ?? this.token;
    const sort = options.sort ?? this.sort;
    return new KToken(token, sort);
  }

  public get terms(): KInner[] {
    return [];
  }

  public letTerms(terms: KInner[]): KToken {
    return this;
  }

  public match(term: KInner): Subst | null {
    if (term instanceof KToken && term.token === this.token) {
      return new Subst();
    }
    return null;
  }
}

export class KVariable extends KInner {
  public readonly name: string;
  public readonly sort: KSort | null;

  constructor(name: string, sort?: string | KSort | null) {
    super();
    this.name = name;
    this.sort =
      sort === null || sort === undefined
        ? null
        : typeof sort === "string"
        ? new KSort(sort)
        : sort;
  }

  public static _fromDict(
    dct: Record<string, any>,
    terms: KInner[]
  ): KVariable {
    const sort = dct.sort ? KSort.fromDict(dct.sort) : null;
    return new KVariable(dct.name, sort);
  }

  public _toDict(terms: Record<string, any>[]): Record<string, any> {
    const result: Record<string, any> = {
      node: "KVariable",
      name: this.name,
    };
    if (this.sort !== null) {
      result.sort = this.sort.toDict();
    }
    return result;
  }

  public let(
    options: { name?: string; sort?: string | KSort | null } = {}
  ): KVariable {
    const name = options.name ?? this.name;
    const sort = options.sort !== undefined ? options.sort : this.sort;
    return new KVariable(name, sort);
  }

  public letSort(sort: KSort | null): KVariable {
    return new KVariable(this.name, sort);
  }

  public get terms(): KInner[] {
    return [];
  }

  public letTerms(terms: KInner[]): KVariable {
    return this;
  }

  public match(term: KInner): Subst {
    return new Subst({ [this.name]: term });
  }
}

export class KApply extends KInner {
  public readonly label: KLabel;
  public readonly args: KInner[];

  constructor(label: string | KLabel, ...args: any[]) {
    super();

    this.label = typeof label === "string" ? new KLabel(label) : label;

    let actualArgs: KInner[];
    if (args.length === 1 && Array.isArray(args[0])) {
      actualArgs = args[0];
    } else {
      actualArgs = args;
    }

    this.args = actualArgs;
  }

  public get arity(): number {
    return this.args.length;
  }

  public get isCell(): boolean {
    return (
      this.label.name.length > 1 &&
      this.label.name[0] === "<" &&
      this.label.name[this.label.name.length - 1] === ">"
    );
  }

  public static _fromDict(dct: Record<string, any>, terms: KInner[]): KApply {
    return new KApply(KLabel.fromDict(dct.label), terms);
  }

  public _toDict(terms: Record<string, any>[]): Record<string, any> {
    return {
      node: "KApply",
      label: this.label.toDict(),
      args: terms,
      arity: this.arity,
      variable: false,
    };
  }

  public let(
    options: { label?: string | KLabel; args?: KInner[] } = {}
  ): KApply {
    const label = options.label ?? this.label;
    const args = options.args ?? this.args;
    return new KApply(label, args);
  }

  public get terms(): KInner[] {
    return this.args;
  }

  public letTerms(terms: KInner[]): KApply {
    return this.let({ args: terms });
  }

  public match(term: KInner): Subst | null {
    if (
      term instanceof KApply &&
      term.label.name === this.label.name &&
      term.arity === this.arity
    ) {
      const matches = this.args.map((arg, i) => arg.match(term.args[i]!));
      return KInner.combineMatches(matches);
    }
    return null;
  }
}

export class KAs extends KInner {
  public readonly pattern: KInner;
  public readonly alias: KInner;

  constructor(pattern: KInner, alias: KInner) {
    super();
    this.pattern = pattern;
    this.alias = alias;
  }

  public static _fromDict(dct: Record<string, any>, terms: KInner[]): KAs {
    const [pattern, alias] = terms;
    return new KAs(pattern!, alias!);
  }

  public _toDict(terms: Record<string, any>[]): Record<string, any> {
    const [pattern, alias] = terms;
    return {
      node: "KAs",
      pattern: pattern,
      alias: alias,
    };
  }

  public let(options: { pattern?: KInner; alias?: KInner } = {}): KAs {
    const pattern = options.pattern ?? this.pattern;
    const alias = options.alias ?? this.alias;
    return new KAs(pattern, alias);
  }

  public get terms(): KInner[] {
    return [this.pattern, this.alias];
  }

  public letTerms(terms: KInner[]): KAs {
    const [pattern, alias] = terms;
    return new KAs(pattern!, alias!);
  }

  public match(term: KInner): Subst | null {
    throw new Error("KAs does not support pattern matching");
  }
}

export class KRewrite extends KInner {
  public readonly lhs: KInner;
  public readonly rhs: KInner;

  constructor(lhs: KInner, rhs: KInner) {
    super();
    this.lhs = lhs;
    this.rhs = rhs;
  }

  public static _fromDict(dct: Record<string, any>, terms: KInner[]): KRewrite {
    const [lhs, rhs] = terms;
    return new KRewrite(lhs!, rhs!);
  }

  public _toDict(terms: Record<string, any>[]): Record<string, any> {
    const [lhs, rhs] = terms;
    return {
      node: "KRewrite",
      lhs: lhs,
      rhs: rhs,
    };
  }

  public let(options: { lhs?: KInner; rhs?: KInner } = {}): KRewrite {
    const lhs = options.lhs ?? this.lhs;
    const rhs = options.rhs ?? this.rhs;
    return new KRewrite(lhs, rhs);
  }

  public get terms(): KInner[] {
    return [this.lhs, this.rhs];
  }

  public letTerms(terms: KInner[]): KRewrite {
    const [lhs, rhs] = terms;
    return new KRewrite(lhs!, rhs!);
  }

  public match(term: KInner): Subst | null {
    if (term instanceof KRewrite) {
      const lhsSubst = this.lhs.match(term.lhs);
      const rhsSubst = this.rhs.match(term.rhs);
      if (lhsSubst === null || rhsSubst === null) {
        return null;
      }
      return lhsSubst.union(rhsSubst);
    }
    return null;
  }

  public applyTop(term: KInner): KInner {
    const subst = this.lhs.match(term);
    if (subst !== null) {
      return subst.apply(this.rhs);
    }
    return term;
  }

  public apply(term: KInner): KInner {
    return bottomUp((t: KInner) => this.applyTop(t), term);
  }

  public replaceTop(term: KInner): KInner {
    /**
     * Similar to applyTop but using exact syntactic matching instead of pattern matching.
     */
    const isMatch = this.lhs.equals(term);
    if (isMatch) {
      return this.rhs;
    }
    return term;
  }

  public replace(term: KInner): KInner {
    /**
     * Similar to apply but using exact syntactic matching instead of pattern matching.
     */
    return bottomUp((t: KInner) => this.replaceTop(t), term);
  }
}

export class KSequence extends KInner {
  public readonly items: KInner[];

  constructor(...args: any[]) {
    super();

    let items: KInner[];
    if (args.length === 1 && Array.isArray(args[0])) {
      items = args[0];
    } else {
      items = args;
    }

    // Flatten nested KSequences
    const flatItems: KInner[] = [];
    for (const item of items) {
      if (item instanceof KSequence) {
        flatItems.push(...item.items);
      } else {
        flatItems.push(item);
      }
    }

    this.items = flatItems;
  }

  public get arity(): number {
    return this.items.length;
  }

  public static _fromDict(
    dct: Record<string, any>,
    terms: KInner[]
  ): KSequence {
    return new KSequence(terms);
  }

  public _toDict(terms: Record<string, any>[]): Record<string, any> {
    return {
      node: "KSequence",
      items: terms,
      arity: this.arity,
    };
  }

  public let(options: { items?: KInner[] } = {}): KSequence {
    const items = options.items ?? this.items;
    return new KSequence(items);
  }

  public get terms(): KInner[] {
    return this.items;
  }

  public letTerms(terms: KInner[]): KSequence {
    return new KSequence(terms);
  }

  public match(term: KInner): Subst | null {
    if (term instanceof KSequence) {
      if (term.arity === this.arity) {
        const matches = this.items.map((item, i) => item.match(term.items[i]!));
        return KInner.combineMatches(matches);
      }

      // Handle variable matching at end - only if the last element is a variable
      // and it's different from previous variables (to avoid conflicts)
      if (
        this.arity > 0 &&
        this.arity < term.arity &&
        this.items[this.items.length - 1] instanceof KVariable
      ) {
        const lastVar = this.items[this.items.length - 1] as KVariable;
        const commonLength = this.items.length - 1;

        // Check if the last variable appears earlier in the pattern
        // If it does, we can't use the variable matching logic
        for (let i = 0; i < commonLength; i++) {
          if (
            this.items[i] instanceof KVariable &&
            (this.items[i] as KVariable).name === lastVar.name
          ) {
            return null; // Conflict: same variable appears multiple times
          }
        }

        let subst: Subst | null = new Subst({
          [lastVar.name]: new KSequence(term.items.slice(commonLength)),
        });

        for (let i = 0; i < commonLength; i++) {
          const match = this.items[i]!.match(term.items[i]!);
          subst = KInner.combineMatches([subst, match]);
          if (subst === null) break;
        }

        return subst;
      }
    }
    return null;
  }
}

export class Subst {
  private readonly _subst: Record<string, KInner>;

  constructor(subst: Map<string, KInner> | Record<string, KInner> = {}) {
    if (subst instanceof Map) {
      this._subst = Object.fromEntries(subst);
    } else {
      this._subst = { ...subst };
    }
  }

  public get(key: string): KInner | undefined {
    return this._subst[key];
  }

  public has(key: string): boolean {
    return key in this._subst;
  }

  public keys(): string[] {
    return Object.keys(this._subst);
  }

  public values(): KInner[] {
    return Object.values(this._subst);
  }

  public entries(): [string, KInner][] {
    return Object.entries(this._subst);
  }

  public get size(): number {
    return Object.keys(this._subst).length;
  }

  public static fromDict(d: Record<string, any>): Subst {
    const entries: Record<string, KInner> = {};
    for (const [k, v] of Object.entries(d)) {
      entries[k] = KInner.fromDict(v);
    }
    return new Subst(entries);
  }

  public toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [k, v] of this.entries()) {
      result[k] = v.toDict();
    }
    return result;
  }

  public union(other: Subst): Subst | null {
    const result: Record<string, KInner> = {};

    // Add all from this
    for (const [k, v] of this.entries()) {
      result[k] = v;
    }

    // Add from other, checking for conflicts
    for (const [k, v] of other.entries()) {
      if (k in result) {
        const existing = result[k]!;
        if (!this.termsEqual(existing, v)) {
          return null; // Conflict detected
        }
      } else {
        result[k] = v;
      }
    }

    return new Subst(result);
  }

  public apply(term: KInner): KInner {
    const replace = (t: KInner): KInner => {
      if (t instanceof KVariable && this.has(t.name)) {
        return this._subst[t.name]!;
      }
      return t;
    };

    return bottomUp(replace, term);
  }

  private termsEqual(t1: KInner, t2: KInner): boolean {
    // Two terms are equal if they have the same structure and content
    if (t1 instanceof KVariable && t2 instanceof KVariable) {
      return (
        t1.name === t2.name &&
        ((t1.sort === null && t2.sort === null) ||
          (t1.sort !== null &&
            t2.sort !== null &&
            t1.sort.name === t2.sort.name))
      );
    }

    // For other types, use structural equality
    return JSON.stringify(t1.toDict()) === JSON.stringify(t2.toDict());
  }

  public unapply(term: KInner): KInner {
    /**
     * Replace occurrences of valuations from this Subst with the variables that they are assigned to.
     */
    let newTerm = term;
    for (const [varName, value] of this.entries()) {
      const lhs = value;
      const rhs = new KVariable(varName);
      const rewrite = new KRewrite(lhs, rhs);
      newTerm = rewrite.replace(newTerm);
    }
    return newTerm;
  }

  public static from_pred(pred: KInner): Subst {
    /**
     * Given a generic matching logic predicate, attempt to extract a Subst from it.
     */
    const subst: Record<string, KInner> = {};

    // Check if the predicate is an mlOr (wrong connective)
    if (pred instanceof KApply && pred.label.name === "#Or") {
      throw new Error(
        `Invalid substitution predicate: wrong connective ${pred}`
      );
    }

    for (const conjunct of flattenLabel("#And", pred)) {
      if (
        conjunct instanceof KApply &&
        conjunct.label.name === "#Equals" &&
        conjunct.args.length === 2
      ) {
        const lhs = conjunct.args[0]!;
        const rhs = conjunct.args[1]!;
        if (lhs instanceof KVariable) {
          subst[lhs.name] = rhs;
        } else {
          throw new Error(`Invalid substitution predicate: ${conjunct}`);
        }
      } else if (
        conjunct instanceof KApply &&
        conjunct.label.name === "#Equals" &&
        conjunct.args.length === 2 &&
        conjunct.args[0] instanceof KToken &&
        conjunct.args[0].token === "true"
      ) {
        // This handles mlEqualsTrue cases - these are not valid for substitution extraction
        throw new Error(`Invalid substitution predicate: ${conjunct}`);
      } else {
        throw new Error(`Invalid substitution predicate: ${conjunct}`);
      }
    }

    return new Subst(subst);
  }

  public compose(other: Subst): Subst {
    /**
     * Union two substitutions together, preferring the assignments in this if present in both.
     * This is the Python compose implementation: from_other = ((k, self(v)) for k, v in other.items())
     */
    const result: Record<string, KInner> = {};

    // First add all mappings from other, applying this substitution to their values
    for (const [k, v] of other.entries()) {
      result[k] = this.apply(v);
    }

    // Then add mappings from this that are not in other
    for (const [k, v] of this.entries()) {
      if (!other.has(k)) {
        result[k] = v;
      }
    }

    return new Subst(result);
  }

  public minimize(): Subst {
    /**
     * Return a new substitution with any identity items removed (x -> x mappings).
     */
    const result: Record<string, KInner> = {};

    for (const [k, v] of this.entries()) {
      if (!(v instanceof KVariable && v.name === k)) {
        result[k] = v;
      }
    }

    return new Subst(result);
  }
}

// Utility functions
export function bottomUpWithSummary<A>(
  f: (term: KInner, summaries: A[]) => [KInner, A],
  kinner: KInner
): [KInner, A] {
  const stack: any[] = [kinner, [], []];

  while (true) {
    const summaries = stack[stack.length - 1];
    const terms = stack[stack.length - 2];
    const term = stack[stack.length - 3];
    const idx = terms.length - term.terms.length;

    if (idx === 0) {
      stack.pop();
      stack.pop();
      stack.pop();
      const [newTerm, summary] = f(term.letTerms(terms), summaries);
      if (stack.length === 0) {
        return [newTerm, summary];
      }
      stack[stack.length - 1].push(summary);
      stack[stack.length - 2].push(newTerm);
    } else {
      stack.push(term.terms[idx]);
      stack.push([]);
      stack.push([]);
    }
  }
}

export function bottomUp(f: (term: KInner) => KInner, kinner: KInner): KInner {
  const stack: any[] = [kinner, []];

  while (true) {
    const terms = stack[stack.length - 1];
    const term = stack[stack.length - 2];
    const idx = terms.length; // The next child index to process

    if (idx === term.terms.length) {
      // We've processed all children
      stack.pop();
      stack.pop();
      const transformedTerm = f(term.letTerms(terms));
      if (!stack || stack.length === 0) {
        return transformedTerm;
      }
      stack[stack.length - 1].push(transformedTerm);
    } else {
      // Process the next child
      stack.push(term.terms[idx]);
      stack.push([]);
    }
  }
}

export function topDown(f: (term: KInner) => KInner, term: KInner): KInner {
  const stack: any[] = [f(term), []];

  while (true) {
    const terms = stack[stack.length - 1];
    const currentTerm = stack[stack.length - 2];
    const idx = terms.length; // The next child index to process

    if (idx === currentTerm.terms.length) {
      // We've processed all children
      stack.pop();
      stack.pop();
      const termWithNewChildren = currentTerm.letTerms(terms);
      if (stack.length === 0) {
        return termWithNewChildren;
      }
      stack[stack.length - 1].push(termWithNewChildren);
    } else {
      // Process the next child
      stack.push(f(currentTerm.terms[idx]));
      stack.push([]);
    }
  }
}

export function varOccurrences(term: KInner): Record<string, KVariable[]> {
  const occurrences: Record<string, KVariable[]> = {};

  const collectVar = (t: KInner): void => {
    if (t instanceof KVariable) {
      if (!(t.name in occurrences)) {
        occurrences[t.name] = [];
      }
      occurrences[t.name]!.push(t);
    }
  };

  collect(collectVar, term);
  return occurrences;
}

export function keepVarsSorted(
  occurrences: Record<string, KVariable[]>
): Record<string, KVariable> {
  const result: Record<string, KVariable> = {};

  for (const [name, variables] of Object.entries(occurrences)) {
    let sort: KSort | null = null;

    for (const variable of variables) {
      if (variable.sort !== null) {
        if (sort === null) {
          sort = variable.sort;
        } else if (sort.name !== variable.sort.name) {
          sort = null;
          break;
        }
      }
    }

    result[name] = new KVariable(name, sort);
  }

  return result;
}

export function collect(callback: (term: KInner) => void, term: KInner): void {
  const subterms: KInner[] = [term];

  while (subterms.length > 0) {
    const currentTerm = subterms.pop()!;
    subterms.push(...currentTerm.terms.slice().reverse());
    callback(currentTerm);
  }
}

export function buildAssoc(
  unit: KInner,
  label: string | KLabel,
  terms: Iterable<KInner>
): KInner {
  const labelObj = typeof label === "string" ? new KLabel(label) : label;
  let result: KInner | null = null;

  const termArray = Array.from(terms).reverse();

  for (const term of termArray) {
    // Check if the term is the same as the unit using the equals method
    if (term.equals(unit)) {
      continue;
    }
    if (result === null) {
      result = term;
    } else {
      result = labelObj.apply(term, result);
    }
  }

  return result || unit;
}

export function buildCons(
  unit: KInner,
  label: string | KLabel,
  terms: Iterable<KInner>
): KInner {
  const termArray = Array.from(terms);

  if (termArray.length === 0) {
    return unit;
  }

  const [first, ...rest] = termArray;
  return new KApply(label, [first, buildCons(unit, label, rest)]);
}

export function flattenLabel(label: string, kast: KInner): KInner[] {
  const flattened: KInner[] = [];
  const restOfArgs: KInner[] = [kast];

  while (restOfArgs.length > 0) {
    const currentArg = restOfArgs.pop()!;
    if (currentArg instanceof KApply && currentArg.label.name === label) {
      restOfArgs.push(...currentArg.args.slice().reverse());
    } else {
      flattened.push(currentArg);
    }
  }

  return flattened;
}
