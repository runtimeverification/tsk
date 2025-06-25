import {
  KApply,
  KInner,
  KRewrite,
  KToken,
  KVariable,
  Subst,
  bottomUp,
  flattenLabel,
} from "../kast/inner";
import {
  abstractTermSafely,
  buildClaim,
  buildRule,
  extractSubst,
  freeVars,
  mlPredToBool,
  normalizeConstraints,
  pushDownRewrites,
  removeUselessConstraints,
  splitConfigAndConstraints,
  splitConfigFrom,
} from "../kast/manip";
import { KClaim, KDefinition, KRule } from "../kast/outer";
import { GENERATED_TOP_CELL, K } from "../kast/prelude/k";
import { andBool, orBool } from "../kast/prelude/kbool";
import {
  isBottom,
  isTop,
  mlAnd,
  mlBottom,
  mlEquals,
  mlEqualsTrue,
  mlImplies,
  mlTop,
} from "../kast/prelude/ml";
import { notNone, unique } from "../utils";

/**
 * Represent a symbolic program state, obtained and manipulated using symbolic execution.
 *
 * Contains the data:
 * - `config`: the _configuration_ (structural component of the state, potentially containing free variables)
 * - `constraints`: conditions which limit/constraint the free variables from the `config`
 */
export class CTerm {
  public readonly config: KInner;
  public readonly constraints: readonly KInner[];

  constructor(config: KInner, constraints: Iterable<KInner> = []) {
    /**
     * Instantiate a given `CTerm`, performing basic sanity checks on the `config` and `constraints`.
     */
    if (isTop(config, { weak: true })) {
      this.config = mlTop();
      this.constraints = [];
    } else if (isBottom(config, { weak: true })) {
      this.config = mlBottom();
      this.constraints = [];
    } else {
      CTerm._checkConfig(config);
      this.config = config;
      this.constraints = CTerm._normalizeConstraints(constraints);
    }
  }

  /**
   * Interpret a given `KInner` as a `CTerm` by splitting the `config` and `constraints` (see `CTerm.kast`).
   */
  public static fromKast(kast: KInner): CTerm {
    if (isTop(kast, { weak: true })) {
      return CTerm.top();
    } else if (isBottom(kast, { weak: true })) {
      return CTerm.bottom();
    } else {
      const [config, constraint] = splitConfigAndConstraints(kast);
      const constraints = flattenLabel("#And", constraint);
      return new CTerm(config, constraints);
    }
  }

  /**
   * Deserialize a `CTerm` from its dictionary representation.
   */
  public static fromDict(dct: Map<string, any>): CTerm {
    const config = KInner.fromDict(dct.get("config"));
    const constraints = dct
      .get("constraints")
      .map((c: any) => KInner.fromDict(c));
    return new CTerm(config, constraints);
  }

  /**
   * Construct a `CTerm` representing all possible states.
   */
  public static top(): CTerm {
    return new CTerm(mlTop(), []);
  }

  /**
   * Construct a `CTerm` representing no possible states.
   */
  public static bottom(): CTerm {
    return new CTerm(mlBottom(), []);
  }

  private static _checkConfig(config: KInner): void {
    if (!(config instanceof KApply) || !config.isCell) {
      throw new Error(`Expected cell label, found: ${config}`);
    }
  }

  private static _normalizeConstraints(
    constraints: Iterable<KInner>
  ): readonly KInner[] {
    const normalizedConstraints = normalizeConstraints(constraints);
    return normalizedConstraints.sort((a, b) =>
      CTerm._constraintSortKey(a).localeCompare(CTerm._constraintSortKey(b))
    );
  }

  /**
   * Check if a given `CTerm` is trivially empty.
   */
  public get isBottom(): boolean {
    return (
      isBottom(this.config, { weak: true }) ||
      this.constraints.some((cterm) => isBottom(cterm, { weak: true }))
    );
  }

  private static _constraintSortKey(term: KInner): string {
    const termStr = term.toString();
    return `${termStr.length.toString().padStart(10, "0")}_${termStr}`;
  }

  /**
   * Return an iterator with the head being the `config` and the tail being the `constraints`.
   */
  public *[Symbol.iterator](): Iterator<KInner> {
    yield this.config;
    yield* this.constraints;
  }

  /**
   * Serialize a `CTerm` to dictionary representation.
   */
  public toDict(): Map<string, any> {
    const result = new Map<string, any>();
    result.set("config", this.config.toDict());
    result.set(
      "constraints",
      this.constraints.map((c) => c.toDict())
    );
    return result;
  }

  /**
   * Return the unstructured bare `KInner` representation of a `CTerm` (see `CTerm.fromKast`).
   */
  public get kast(): KInner {
    return mlAnd([this.config, ...this.constraints], GENERATED_TOP_CELL);
  }

  /**
   * Return the unstructured bare `KInner` representation of the constraints.
   */
  public get constraint(): KInner {
    return mlAnd(this.constraints, GENERATED_TOP_CELL);
  }

  /**
   * Return the set of free variable names contained in this `CTerm`.
   */
  public get freeVars(): Set<string> {
    return freeVars(this.kast);
  }

  /**
   * Unique hash representing the contents of this `CTerm`.
   */
  public get hash(): string {
    return this.kast.hash;
  }

  /**
   * Return key-value store of the contents of each cell in the `config`.
   */
  public get cells(): Subst {
    const [, substMap] = splitConfigFrom(this.config);
    return new Subst(substMap);
  }

  /**
   * Access the contents of a named cell in the `config`, die on failure.
   */
  public cell(cell: string): KInner {
    const value = this.cells.get(cell);
    if (value === undefined) {
      throw new Error(`Cell ${cell} not found`);
    }
    return value;
  }

  /**
   * Access the contents of a named cell in the `config`, return `null` on failure.
   */
  public tryCell(cell: string): KInner | null {
    return this.cells.get(cell) ?? null;
  }

  /**
   * Find `Subst` instantiating this `CTerm` to the other, return `null` if no such `Subst` exists.
   */
  public match(cterm: CTerm): Subst | null {
    const csubst = this.matchWithConstraint(cterm);

    if (!csubst) {
      return null;
    }

    if (!csubst.constraint.equals(mlTop(GENERATED_TOP_CELL))) {
      return null;
    }

    return csubst.subst;
  }

  /**
   * Find `CSubst` instantiating this `CTerm` to the other, return `null` if no such `CSubst` exists.
   */
  public matchWithConstraint(cterm: CTerm): CSubst | null {
    const subst = this.config.match(cterm.config);

    if (subst === null) {
      return null;
    }

    const sourceConstraints = this.constraints.map((c) => subst.apply(c));
    // Use structural equality instead of reference equality for constraint filtering
    const constraints = cterm.constraints.filter(
      (c) => !sourceConstraints.some((sc) => sc.equals(c))
    );

    return new CSubst(subst, constraints);
  }

  private static _mlImpl(
    antecedents: Iterable<KInner>,
    consequents: Iterable<KInner>
  ): KInner {
    const antecedent = mlAnd(unique(antecedents), GENERATED_TOP_CELL);
    const consequentList = Array.from(unique(consequents)).filter(
      (term) => !Array.from(antecedents).includes(term)
    );
    const consequent = mlAnd(consequentList, GENERATED_TOP_CELL);

    if ([antecedent, consequent].includes(mlTop(GENERATED_TOP_CELL))) {
      return consequent;
    }

    return mlImplies(antecedent, consequent, GENERATED_TOP_CELL);
  }

  /**
   * Return a new `CTerm` with the additional constraints.
   */
  public addConstraint(newConstraint: KInner): CTerm {
    return new CTerm(this.config, [newConstraint, ...this.constraints]);
  }

  /**
   * Given two `CTerm` instances, find a more general `CTerm` which can instantiate to both.
   *
   * @param other - other `CTerm` to consider for finding a more general `CTerm` with this one.
   * @param keepValues - do not discard information about abstracted variables in returned result.
   * @param kdef - `KDefinition` to make analysis more precise.
   * @returns A tuple `[cterm, csubst1, csubst2]` where
   *   - `cterm`: More general `CTerm` than either `this` or `other`.
   *   - `csubst1`: Constrained substitution to apply to `cterm` to obtain `this`.
   *   - `csubst2`: Constrained substitution to apply to `cterm` to obtain `other`.
   */
  public antiUnify(
    other: CTerm,
    keepValues: boolean = false,
    kdef?: KDefinition
  ): [CTerm, CSubst, CSubst] {
    const [newConfig, selfSubst, otherSubst] = antiUnify(
      this.config,
      other.config,
      kdef
    );
    const commonConstraints = this.constraints.filter((constraint) =>
      other.constraints.includes(constraint)
    );

    let newCterm = new CTerm(newConfig, []);

    if (keepValues) {
      // todo: It's not able to distinguish between constraints in different cterms,
      //  because variable names may be used inconsistently in different cterms.
      const selfUniqueConstraints = this.constraints
        .filter((constraint) => !other.constraints.includes(constraint))
        .map((constraint) => mlPredToBool(constraint));
      const otherUniqueConstraints = other.constraints
        .filter((constraint) => !this.constraints.includes(constraint))
        .map((constraint) => mlPredToBool(constraint));

      const disjunctLhs = andBool([
        new CSubst(selfSubst).pred(),
        ...selfUniqueConstraints,
      ]);
      const disjunctRhs = andBool([
        new CSubst(otherSubst).pred(),
        ...otherUniqueConstraints,
      ]);
      const trueBool = new KToken("true", "Bool");

      if (![disjunctLhs, disjunctRhs].includes(trueBool)) {
        newCterm = newCterm.addConstraint(
          mlEqualsTrue(orBool([disjunctLhs, disjunctRhs]))
        );
      }
    }

    const newConstraints = removeUselessConstraints(
      commonConstraints,
      newCterm.freeVars
    );

    for (const constraint of newConstraints) {
      newCterm = newCterm.addConstraint(constraint);
    }

    const selfCsubst = newCterm.matchWithConstraint(this);
    const otherCsubst = newCterm.matchWithConstraint(other);

    if (selfCsubst === null || otherCsubst === null) {
      throw new Error(
        `Anti-unification failed to produce a more general state: ${JSON.stringify(
          {
            newCterm: newCterm.toString(),
            self: [this.toString(), selfCsubst],
            other: [other.toString(), otherCsubst],
          }
        )}`
      );
    }

    return [newCterm, selfCsubst, otherCsubst];
  }

  /**
   * Return a new `CTerm` with constraints over unbound variables removed.
   *
   * @param keepVars - List of variables to keep constraints for even if unbound in the `CTerm`.
   * @returns A `CTerm` with the constraints over unbound variables removed.
   */
  public removeUselessConstraints(keepVars: Iterable<string> = []): CTerm {
    const initialVars = new Set([...freeVars(this.config), ...keepVars]);
    const newConstraints = removeUselessConstraints(
      this.constraints,
      initialVars
    );
    return new CTerm(this.config, newConstraints);
  }
}

/**
 * Return a generalized state over the two input states.
 *
 * @param state1 - State to generalize over, represented as bare `KInner`.
 * @param state2 - State to generalize over, represented as bare `KInner`.
 * @param kdef - `KDefinition` to make the analysis more precise.
 * @returns A tuple `[state, subst1, subst2]` such that
 *   - `state`: A symbolic state represented as `KInner` which is more general than `state1` or `state2`.
 *   - `subst1`: A `Subst` which, when applied to `state`, recovers `state1`.
 *   - `subst2`: A `Subst` which, when applied to `state`, recovers `state2`.
 *
 * Note: Both `state1` and `state2` are expected to be bare configurations with no constraints attached.
 */
export function antiUnify(
  state1: KInner,
  state2: KInner,
  kdef?: KDefinition
): [KInner, Subst, Subst] {
  function rewritesToAbstractions(kast: KInner): KInner {
    if (kast instanceof KRewrite) {
      const sort = kdef?.sort(kast) ?? null;
      return abstractTermSafely(kast, "V", sort);
    }
    return kast;
  }

  const minimizedRewrite = pushDownRewrites(new KRewrite(state1, state2));
  const abstractedState = bottomUp(rewritesToAbstractions, minimizedRewrite);
  const subst1 = abstractedState.match(state1);
  const subst2 = abstractedState.match(state2);

  if (subst1 === null || subst2 === null) {
    throw new Error("Anti-unification failed to produce a more general state!");
  }

  return [abstractedState, subst1, subst2];
}

/**
 * Store information about instantiation of a symbolic state (`CTerm`) to a more specific one.
 *
 * Contains the data:
 * - `subst`: assignment to apply to free variables in the state to achieve more specific one
 * - `constraints`: additional constraints over the free variables of the original state and the `subst` to add to the new state
 */
export class CSubst {
  public readonly subst: Subst;
  public readonly constraints: readonly KInner[];

  constructor(subst?: Subst, constraints: Iterable<KInner> = []) {
    /**
     * Construct a new `CSubst` given a `Subst` and set of constraints as `KInner`, performing basic sanity checks.
     */
    this.subst = subst ?? new Subst({});
    this.constraints = normalizeConstraints(constraints);
  }

  /**
   * Return an iterator with the head being the `subst` and the tail being the `constraints`.
   */
  public *[Symbol.iterator](): Iterator<Subst | KInner> {
    yield this.subst;
    yield* this.constraints;
  }

  /**
   * Serialize `CSubst` to dictionary representation.
   */
  public toDict(): Map<string, any> {
    const result = new Map<string, any>();
    result.set("subst", this.subst.toDict());
    result.set(
      "constraints",
      this.constraints.map((c) => c.toDict())
    );
    return result;
  }

  /**
   * Deserialize `CSubst` from a dictionary representation.
   */
  public static fromDict(dct: Map<string, any>): CSubst {
    const subst = Subst.fromDict(dct.get("subst"));
    const constraints = dct
      .get("constraints")
      .map((c: any) => KInner.fromDict(c));
    return new CSubst(subst, constraints);
  }

  /**
   * Extract from a boolean predicate a CSubst.
   */
  public static fromPred(pred: KInner): CSubst {
    const [subst, predRemainder] = extractSubst(pred);
    return new CSubst(subst, flattenLabel("#And", predRemainder));
  }

  /**
   * Return an ML predicate representing this substitution.
   */
  public pred(
    sortWith?: KDefinition,
    subst: boolean = true,
    constraints: boolean = true
  ): KInner {
    const preds: KInner[] = [];

    if (subst) {
      for (const [k, v] of this.subst.minimize().entries()) {
        let sort = K;
        if (sortWith !== undefined) {
          const sortResult = sortWith.sort(v);
          sort = sortResult ?? sort;
        }
        preds.push(mlEquals(new KVariable(k, sort), v, sort));
      }
    }

    if (constraints) {
      preds.push(...this.constraints);
    }

    return mlAnd(preds);
  }

  /**
   * Return the set of constraints as a single flattened constraint using `mlAnd`.
   */
  public get constraint(): KInner {
    return mlAnd(this.constraints);
  }

  /**
   * Return this `CSubst` with an additional constraint added.
   */
  public addConstraint(constraint: KInner): CSubst {
    return new CSubst(this.subst, [...this.constraints, constraint]);
  }

  /**
   * Apply this `CSubst` to the given `CTerm` (instantiating the free variables, and adding the constraints).
   */
  public apply(cterm: CTerm): CTerm {
    const config = this.subst.apply(cterm.config);
    const constraints = [
      ...cterm.constraints.map((constraint) => this.subst.apply(constraint)),
      ...this.constraints,
    ];
    return new CTerm(config, constraints);
  }

  /**
   * Overload for `CSubst.apply`.
   */
  public call(cterm: CTerm): CTerm {
    return this.apply(cterm);
  }
}

/**
 * Return a `KClaim` between the supplied initial and final states.
 *
 * @param claimId - Label to give the claim.
 * @param initCterm - State to put on LHS of the rule (constraints interpreted as `requires` clause).
 * @param finalCterm - State to put on RHS of the rule (constraints interpreted as `ensures` clause).
 * @param keepVars - Variables to leave in the side-conditions even if not bound in the configuration.
 * @returns A tuple `[claim, varMap]` where
 *   - `claim`: A `KClaim` with variable naming conventions applied so that it should be parseable by the K Frontend.
 *   - `varMap`: The variable renamings applied to make the claim parseable by the K Frontend
 *     (which can be undone to recover original variables).
 */
export function ctermBuildClaim(
  claimId: string,
  initCterm: CTerm,
  finalCterm: CTerm,
  keepVars: Iterable<string> = []
): [KClaim, Subst] {
  const [initConfig, ...initConstraints] = initCterm;
  const [finalConfig, ...finalConstraints] = finalCterm;
  return buildClaim(
    claimId,
    initConfig!,
    finalConfig!,
    initConstraints,
    finalConstraints,
    keepVars
  );
}

/**
 * Return a `KRule` between the supplied initial and final states.
 *
 * @param ruleId - Label to give the rule.
 * @param initCterm - State to put on LHS of the rule (constraints interpreted as `requires` clause).
 * @param finalCterm - State to put on RHS of the rule (constraints interpreted as `ensures` clause).
 * @param priority - Priority index to use for generated rules.
 * @param keepVars - Variables to leave in the side-conditions even if not bound in the configuration.
 * @param defuncWith - KDefinition to be able to defunctionalize LHS appropriately.
 * @returns A tuple `[rule, varMap]` where
 *   - `rule`: A `KRule` with variable naming conventions applied so that it should be parseable by the K Frontend.
 *   - `varMap`: The variable renamings applied to make the rule parseable by the K Frontend
 *     (which can be undone to recover original variables).
 */
export function ctermBuildRule(
  ruleId: string,
  initCterm: CTerm,
  finalCterm: CTerm,
  priority?: number,
  keepVars: Iterable<string> = [],
  defuncWith?: KDefinition
): [KRule, Subst] {
  const [initConfig, ...initConstraints] = initCterm;
  const [finalConfig, ...finalConstraints] = finalCterm;
  return buildRule(
    ruleId,
    initConfig!,
    finalConfig!,
    initConstraints,
    finalConstraints,
    priority,
    keepVars,
    defuncWith
  );
}

/**
 * Given many `CTerm` instances, find a more general `CTerm` which can instantiate to all.
 *
 * @param cterms - `CTerm`s to consider for finding a more general `CTerm` with this one.
 * @param keepValues - do not discard information about abstracted variables in returned result.
 * @param kdef - `KDefinition` to make analysis more precise.
 * @returns A tuple `[cterm, csubsts]` where
 *   - `cterm`: More general `CTerm` than any of the input `CTerm`s.
 *   - `csubsts`: List of `CSubst` which, when applied to `cterm`, yield the input `CTerm`s.
 */
export function ctermsAntiUnify(
  cterms: Iterable<CTerm>,
  keepValues: boolean = false,
  kdef?: KDefinition
): [CTerm, CSubst[]] {
  // TODO: optimize this function, reduce useless auto-generated variables.
  const ctermsList = Array.from(cterms);
  if (ctermsList.length === 0) {
    throw new Error("Anti-unification failed, no CTerms provided");
  }

  let mergedCterm = ctermsList[0]!;
  for (let i = 1; i < ctermsList.length; i++) {
    const [newMerged] = mergedCterm.antiUnify(ctermsList[i]!, keepValues, kdef);
    mergedCterm = newMerged;
  }

  const csubsts = ctermsList.map((cterm) =>
    notNone(mergedCterm.matchWithConstraint(cterm))
  );
  return [mergedCterm, csubsts];
}
