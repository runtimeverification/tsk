import { findCommonItems, hashStr, unique } from "../utils";
import {
  Atts,
  EMPTY_ATT,
  KAtt,
  isWithKAtt,
  mapAtt,
  updateAtts,
  type WithKAtt,
} from "./att";
import { Counter } from "./counter";
import {
  KApply,
  KInner,
  KLabel,
  KRewrite,
  KSequence,
  KSort,
  KToken,
  KVariable,
  Subst,
  bottomUp,
  collect,
  flattenLabel,
  keepVarsSorted,
  topDown,
  varOccurrences,
} from "./inner";
import { KClaim, KDefinition, KFlatModule, KRule, KRuleLike } from "./outer";
import { DOTS, GENERATED_TOP_CELL } from "./prelude/k";
import {
  FALSE,
  TRUE,
  andBool,
  impliesBool,
  notBool,
  orBool,
} from "./prelude/kbool";
import {
  isTop,
  mlAnd,
  mlBottom,
  mlEquals,
  mlEqualsTrue,
  mlImplies,
  mlOr,
  mlTop,
} from "./prelude/ml";
import { indexedRewrite } from "./rewrite";

export function isTermLike(kast: KInner): boolean {
  let nonTermFound = false;

  function checkIsTermLike(k: KInner): void {
    if (k instanceof KVariable && k.name.startsWith("@")) {
      nonTermFound = true;
    } else if (k instanceof KApply) {
      const mlLabels = new Set([
        "#Equals",
        "#And",
        "#Or",
        "#Top",
        "#Bottom",
        "#Implies",
        "#Not",
        "#Ceil",
        "#Forall",
        "#Exists",
      ]);
      if (mlLabels.has(k.label.name)) {
        nonTermFound = true;
      }
    }
  }

  collect(checkIsTermLike, kast);
  return !nonTermFound;
}

export function sortAssocLabel(label: string, kast: KInner): KInner {
  if (kast instanceof KApply && kast.label.name === label) {
    const terms = flattenLabel(label, kast).sort();
    let result: KInner | null = null;
    for (const term of terms.reverse()) {
      if (!result) {
        result = term;
      } else {
        result = new KApply(kast.label, [term, result]);
      }
    }
    return result!;
  }
  return kast;
}

export function sortAcCollections(kast: KInner): KInner {
  function sortAcCollectionsInner(k: KInner): KInner {
    if (k instanceof KApply) {
      const acLabels = ["_Set_", "_Map_", "_RangeMap_"];
      if (
        acLabels.includes(k.label.name) ||
        k.label.name.endsWith("CellMap_")
      ) {
        return sortAssocLabel(k.label.name, k);
      }
    }
    return k;
  }

  return topDown(sortAcCollectionsInner, kast);
}

export function ifKtype<T extends KInner>(
  ktype: new (...args: any[]) => T,
  then: (term: T) => KInner
): (term: KInner) => KInner {
  return (term: KInner): KInner => {
    if (term instanceof ktype) {
      return then(term);
    }
    return term;
  };
}

export function boolToMlPred(
  kast: KInner,
  sort: KSort = GENERATED_TOP_CELL
): KInner {
  function boolConstraintToMl(k: KInner): KInner {
    if (k === TRUE) {
      return mlTop(sort);
    }
    if (k === FALSE) {
      return mlBottom(sort);
    }
    return mlEqualsTrue(k, sort);
  }

  return mlAnd(flattenLabel("_andBool_", kast).map(boolConstraintToMl), sort);
}

export function mlPredToBool(kast: KInner, unsafe: boolean = false): KInner {
  function mlConstraintToBool(k: KInner): KInner {
    if (k instanceof KApply) {
      switch (k.label.name) {
        case "#Top":
          return TRUE;
        case "#Bottom":
          return FALSE;
        case "#Not":
          if (k.args.length === 1) {
            return notBool(mlConstraintToBool(k.args[0]!));
          }
          break;
        case "#And":
          return andBool(k.args.map(mlConstraintToBool));
        case "#Or":
          return orBool(k.args.map(mlConstraintToBool));
        case "#Implies":
          if (k.args.length === 2) {
            return impliesBool(
              mlConstraintToBool(k.args[0]!),
              mlConstraintToBool(k.args[1]!)
            );
          }
          break;
        case "#Equals": {
          const [first, second] = k.args;
          if (first === TRUE) return second!;
          if (first === FALSE) return notBool(second!);
          if (second === TRUE) return first!;
          if (second === FALSE) return notBool(first!);

          if (first instanceof KVariable || first instanceof KToken) {
            const sort = first.sort;
            if (sort?.name === "Int") {
              return new KApply(new KLabel("_==Int_"), k.args);
            } else {
              return new KApply(new KLabel("_==K_"), k.args);
            }
          }

          if (second instanceof KVariable || second instanceof KToken) {
            const sort = second.sort;
            if (sort?.name === "Int") {
              return new KApply(new KLabel("_==Int_"), k.args);
            } else {
              return new KApply(new KLabel("_==K_"), k.args);
            }
          }

          if (first instanceof KSequence && second instanceof KSequence) {
            if (first.arity === 1 && second.arity === 1) {
              return new KApply(new KLabel("_==K_"), [
                first.items[0]!,
                second.items[0]!,
              ]);
            }
          }

          if (isTermLike(first!) && isTermLike(second!)) {
            return new KApply(new KLabel("_==K_"), [first!, second!]);
          }
          break;
        }
      }

      if (unsafe) {
        if (k.label.name === "#Equals") {
          return new KApply(new KLabel("_==K_"), k.args);
        }
        if (k.label.name === "#Ceil") {
          const ceilVar = abstractTermSafely(k, "Ceil");
          console.warn(
            `Converting #Ceil condition to variable ${ceilVar.name}: ${k}`
          );
          return ceilVar;
        }
        if (k.label.name === "#Exists") {
          const existsVar = abstractTermSafely(k, "Exists");
          console.warn(
            `Converting #Exists condition to variable ${existsVar.name}: ${k}`
          );
          return existsVar;
        }
      }
    }
    throw new Error(`Could not convert ML predicate to sort Bool: ${k}`);
  }

  return mlConstraintToBool(kast);
}

export function simplifyBool(k: KInner): KInner {
  if (k === null || k === undefined) {
    return k;
  }

  const simplifyRules: [KInner, KInner][] = [
    [
      new KApply(new KLabel("_==K_"), [new KVariable("#LHS"), TRUE]),
      new KVariable("#LHS"),
    ],
    [
      new KApply(new KLabel("_==K_"), [TRUE, new KVariable("#RHS")]),
      new KVariable("#RHS"),
    ],
    [
      new KApply(new KLabel("_==K_"), [new KVariable("#LHS"), FALSE]),
      notBool(new KVariable("#LHS")),
    ],
    [
      new KApply(new KLabel("_==K_"), [FALSE, new KVariable("#RHS")]),
      notBool(new KVariable("#RHS")),
    ],
    [notBool(FALSE), TRUE],
    [notBool(TRUE), FALSE],
    [
      notBool(
        new KApply(new KLabel("_==K_"), [
          new KVariable("#V1"),
          new KVariable("#V2"),
        ])
      ),
      new KApply(new KLabel("_=/=K_"), [
        new KVariable("#V1"),
        new KVariable("#V2"),
      ]),
    ],
    [
      notBool(
        new KApply(new KLabel("_=/=K_"), [
          new KVariable("#V1"),
          new KVariable("#V2"),
        ])
      ),
      new KApply(new KLabel("_==K_"), [
        new KVariable("#V1"),
        new KVariable("#V2"),
      ]),
    ],
    [
      notBool(
        new KApply(new KLabel("_==Int_"), [
          new KVariable("#V1"),
          new KVariable("#V2"),
        ])
      ),
      new KApply(new KLabel("_=/=Int_"), [
        new KVariable("#V1"),
        new KVariable("#V2"),
      ]),
    ],
    [
      notBool(
        new KApply(new KLabel("_=/=Int_"), [
          new KVariable("#V1"),
          new KVariable("#V2"),
        ])
      ),
      new KApply(new KLabel("_==Int_"), [
        new KVariable("#V1"),
        new KVariable("#V2"),
      ]),
    ],
    [andBool([TRUE, new KVariable("#REST")]), new KVariable("#REST")],
    [andBool([new KVariable("#REST"), TRUE]), new KVariable("#REST")],
    [andBool([FALSE, new KVariable("#REST")]), FALSE],
    [andBool([new KVariable("#REST"), FALSE]), FALSE],
    [orBool([FALSE, new KVariable("#REST")]), new KVariable("#REST")],
    [orBool([new KVariable("#REST"), FALSE]), new KVariable("#REST")],
    [orBool([TRUE, new KVariable("#REST")]), TRUE],
    [orBool([new KVariable("#REST"), TRUE]), TRUE],
  ];

  let newK = k;
  for (const [lhs, rhs] of simplifyRules) {
    const rewrite = new KRewrite(lhs, rhs);
    newK = rewrite.apply(newK);
  }
  return newK;
}

export function normalizeMlPred(pred: KInner): KInner {
  return boolToMlPred(simplifyBool(mlPredToBool(pred)));
}

export function extractLhs(term: KInner): KInner {
  return topDown(
    ifKtype(KRewrite, (rw) => rw.lhs),
    term
  );
}

export function extractRhs(term: KInner): KInner {
  return topDown(
    ifKtype(KRewrite, (rw) => rw.rhs),
    term
  );
}

export function extractSubst(term: KInner): [Subst, KInner] {
  const subst: Record<string, KInner> = {};
  const remConjuncts: KInner[] = [];

  function extractSubstInner(
    term1: KInner,
    term2: KInner
  ): [string, KInner] | null {
    if (
      term1 instanceof KVariable &&
      !(term1.name in subst) &&
      !(term2 instanceof KVariable && term2.name in subst) &&
      !freeVars(term2).has(term1.name)
    ) {
      return [term1.name, term2];
    }
    if (
      term2 instanceof KVariable &&
      !(term2.name in subst) &&
      !(term1 instanceof KVariable && term1.name in subst) &&
      !freeVars(term1).has(term2.name)
    ) {
      return [term2.name, term1];
    }
    if (
      term1 === TRUE &&
      term2 instanceof KApply &&
      ["_==K_", "_==Int_"].includes(term2.label.name)
    ) {
      return extractSubstInner(term2.args[0]!, term2.args[1]!);
    }
    if (
      term2 === TRUE &&
      term1 instanceof KApply &&
      ["_==K_", "_==Int_"].includes(term1.label.name)
    ) {
      return extractSubstInner(term1.args[0]!, term1.args[1]!);
    }
    return null;
  }

  const flattenedTerms = flattenLabel("#And", term);

  for (const conjunct of flattenedTerms) {
    if (conjunct instanceof KApply && conjunct.label.name === "#Equals") {
      const conjunctSubst = extractSubstInner(
        conjunct.args[0]!,
        conjunct.args[1]!
      );
      if (conjunctSubst) {
        const [name, value] = conjunctSubst;
        subst[name] = value;
      } else {
        remConjuncts.push(conjunct);
      }
    } else {
      remConjuncts.push(conjunct);
    }
  }

  // If there's only one term and it's not an #And, return the original term when no substitutions found
  if (flattenedTerms.length === 1 && Object.keys(subst).length === 0) {
    return [new Subst(subst), term];
  }

  // If no remaining conjuncts after extracting substitutions, return mlTop()
  if (remConjuncts.length === 0) {
    return [new Subst(subst), mlTop()];
  }

  return [new Subst(subst), mlAnd(remConjuncts)];
}

export function countVars(term: KInner): Counter<string> {
  const counter = new Counter<string>();
  const occurrences = varOccurrences(term);
  for (const [vname, vars] of occurrences.entries()) {
    counter.set(vname, vars.length);
  }
  return counter;
}

export function freeVars(kast: KInner): Set<string> {
  return new Set(countVars(kast).keys());
}

export function propagateUpConstraints(k: KInner): KInner {
  function propagateUpConstraintsInner(kInner: KInner): KInner {
    if (!(kInner instanceof KApply && kInner.label.name === "#Or")) {
      return kInner;
    }
    const topSort = kInner.label.params[0];
    const conjuncts1 = flattenLabel("#And", kInner.args[0]!);
    const conjuncts2 = flattenLabel("#And", kInner.args[1]!);
    const [common1, l1, r1] = findCommonItems(conjuncts1, conjuncts2);
    const [common2, r2, l2] = findCommonItems(r1, l1);
    const common = [...common1, ...common2];
    if (common.length === 0) {
      return kInner;
    }
    const conjunct1 = mlAnd(l2, topSort);
    const conjunct2 = mlAnd(r2, topSort);
    const disjunct = mlOr([conjunct1, conjunct2], topSort);
    return mlAnd([disjunct, ...common], topSort);
  }

  return bottomUp(propagateUpConstraintsInner, k);
}

export function splitConfigAndConstraints(kast: KInner): [KInner, KInner] {
  const conjuncts = flattenLabel("#And", kast);
  let term: KInner | null = null;
  const constraints: KInner[] = [];

  for (const c of conjuncts) {
    if (c instanceof KApply && c.isCell) {
      if (term) {
        throw new Error(
          `Found two configurations in pattern:\n\n${term}\n\nand\n\n${c}`
        );
      }
      term = c;
    } else {
      constraints.push(c);
    }
  }

  if (!term) {
    throw new Error(`Could not find configuration for: ${kast}`);
  }

  return [term, mlAnd(constraints, GENERATED_TOP_CELL)];
}

export function cellLabelToVarName(label: string): string {
  return (
    label.replace(/-/g, "_").replace(/</g, "").replace(/>/g, "").toUpperCase() +
    "_CELL"
  );
}

export function splitConfigFrom(
  configuration: KInner
): [KInner, Record<string, KInner>] {
  const initialSubstitution: Record<string, KInner> = {};

  function replaceWithVar(k: KInner): KInner {
    if (k instanceof KApply && k.isCell) {
      if (
        k.arity === 1 &&
        !(k.args[0] instanceof KApply && k.args[0]!.isCell)
      ) {
        const configVar = cellLabelToVarName(k.label.name);
        initialSubstitution[configVar] = k.args[0]!;
        return new KApply(k.label, [new KVariable(configVar)]);
      }
    }
    return k;
  }

  const symbolicConfig = topDown(replaceWithVar, configuration);
  return [symbolicConfig, initialSubstitution];
}

export function collapseDots(kast: KInner): KInner {
  function collapseDotsInner(k: KInner): KInner {
    if (k instanceof KApply) {
      if (k.isCell && k.arity === 1 && k.args[0] === DOTS) {
        return DOTS;
      }
      const newArgs = k.args.filter((arg) => arg !== DOTS);
      if (k.isCell && newArgs.length === 0) {
        return DOTS;
      }
      if (newArgs.length < k.args.length) {
        newArgs.push(DOTS);
      }
      return k.let({ args: newArgs });
    } else if (k instanceof KRewrite) {
      if (k.lhs === DOTS) {
        return DOTS;
      }
    }
    return k;
  }

  return bottomUp(collapseDotsInner, kast);
}

export function pushDownRewrites(kast: KInner): KInner {
  function pushDownRewritesInner(k: KInner): KInner {
    if (k instanceof KRewrite) {
      const { lhs, rhs } = k;
      if (lhs === rhs) {
        return lhs;
      }
      if (
        lhs instanceof KVariable &&
        rhs instanceof KVariable &&
        lhs.name === rhs.name
      ) {
        return lhs;
      }
      if (
        lhs instanceof KApply &&
        rhs instanceof KApply &&
        lhs.label.name === rhs.label.name &&
        lhs.arity === rhs.arity
      ) {
        const newArgs = lhs.args.map(
          (leftArg, i) => new KRewrite(leftArg, rhs.args[i]!)
        );
        return lhs.let({ args: newArgs });
      }
      if (
        lhs instanceof KSequence &&
        rhs instanceof KSequence &&
        lhs.arity > 0 &&
        rhs.arity > 0
      ) {
        if (lhs.arity === 1 && rhs.arity === 1) {
          return pushDownRewritesInner(new KRewrite(lhs.items[0]!, rhs.items[0]!));
        }
        if (lhs.items[0] === rhs.items[0]) {
          const lowerRewrite = pushDownRewritesInner(
            new KRewrite(
              new KSequence(lhs.items.slice(1)),
              new KSequence(rhs.items.slice(1))
            )
          );
          return new KSequence([lhs.items[0]!, lowerRewrite]);
        }
        if (
          lhs.items[lhs.items.length - 1] === rhs.items[rhs.items.length - 1]
        ) {
          const lowerRewrite = pushDownRewritesInner(
            new KRewrite(
              new KSequence(lhs.items.slice(0, -1)),
              new KSequence(rhs.items.slice(0, -1))
            )
          );
          return new KSequence([
            lowerRewrite,
            lhs.items[lhs.items.length - 1]!,
          ]);
        }
      }
      if (
        lhs instanceof KSequence &&
        lhs.arity > 0 &&
        lhs.items[lhs.items.length - 1] instanceof KVariable &&
        rhs instanceof KVariable &&
        lhs.items[lhs.items.length - 1] === rhs
      ) {
        return new KSequence([
          new KRewrite(
            new KSequence(lhs.items.slice(0, -1)),
            new KSequence([])
          ),
          rhs,
        ]);
      }
    }
    return k;
  }

  return topDown(pushDownRewritesInner, kast);
}

export function inlineCellMaps(kast: KInner): KInner {
  function inlineCellMapsInner(k: KInner): KInner {
    if (k instanceof KApply && k.label.name.endsWith("CellMapItem")) {
      const mapKey = k.args[0];
      if (mapKey instanceof KApply && mapKey.isCell) {
        return k.args[1]!;
      }
    }
    return k;
  }

  return bottomUp(inlineCellMapsInner, kast);
}

export function removeSemanticCasts(kast: KInner): KInner {
  function removeSemanticCastsInner(k: KInner): KInner {
    if (
      k instanceof KApply &&
      k.arity === 1 &&
      k.label.name.startsWith("#SemanticCast")
    ) {
      return k.args[0]!;
    }
    return k;
  }

  return bottomUp(removeSemanticCastsInner, kast);
}

export function uselessVarsToDots(
  kast: KInner,
  keepVars: Iterable<string> = []
): KInner {
  const numOccs = countVars(kast);
  numOccs.update(keepVars);

  function collapseUselessVars(k: KInner): KInner {
    if (k instanceof KApply && k.isCell) {
      const newArgs: KInner[] = [];
      for (const arg of k.args) {
        if (arg instanceof KVariable && numOccs.get(arg.name, 0) === 1) {
          newArgs.push(DOTS);
        } else {
          newArgs.push(arg);
        }
      }
      return k.let({ args: newArgs });
    }
    return k;
  }

  return bottomUp(collapseUselessVars, kast);
}

export function labelsToDots(kast: KInner, labels: Set<string>): KInner {
  function labelsToDotsInner(k: KInner): KInner {
    if (k instanceof KApply && k.isCell && labels.has(k.label.name)) {
      return DOTS;
    }
    return k;
  }

  return bottomUp(labelsToDotsInner, kast);
}

export function extractCells(kast: KInner, keepCells: Set<string>): KInner {
  function extractCellsInner(k: KInner): KInner {
    if (
      k instanceof KApply &&
      k.isCell &&
      !keepCells.has(k.label.name) &&
      k.args.every(
        (arg) => !(arg instanceof KApply) || !arg.isCell
        // QUESTION: Yiyi: Cannot compare arg === DOTS here.
        /*|| arg === DOTS*/
      )
    ) {
      return DOTS;
    }
    return k;
  }

  return bottomUp(extractCellsInner, kast);
}

export function onAttributes<T extends WithKAtt>(
  kast: T,
  f: (att: KAtt) => KAtt
): T {
  // TODO: Implement proper attribute mapping
  const result = mapAtt(kast, f);

  if (result instanceof KFlatModule) {
    const sentences = result.sentences.map((sentence) => mapAtt(sentence, f));
    return result.let({ sentences }) as unknown as T;
  }

  // QUESTION: Yiyi: We met type error here:
  /*
  if (result instanceof KDefinition) {
    const modules = result.modules.map((module) => mapAtt(module, f));
    return result.let({ modules }) as unknown as T;
  }
  */

  return result;
}

export function minimizeTerm(
  term: KInner,
  keepVars: Iterable<string> = []
): KInner {
  let result = term;
  result = inlineCellMaps(result);
  result = removeSemanticCasts(result);
  result = uselessVarsToDots(result, keepVars);
  result = collapseDots(result);
  return result;
}

export function minimizeRuleLike<T extends KRuleLike>(
  rule: T,
  keepVars: Iterable<string> = []
): T {
  let body = rule.body;
  let requires = rule.requires;
  let ensures = rule.ensures;

  requires = andBool(flattenLabel("_andBool_", requires));
  requires = simplifyBool(requires);

  ensures = andBool(flattenLabel("_andBool_", ensures));
  ensures = simplifyBool(ensures);

  const constrainedVars = new Set([
    ...keepVars,
    ...freeVars(requires),
    ...freeVars(ensures),
  ]);
  body = minimizeTerm(body, constrainedVars);

  return rule.let({ body, requires, ensures }) as unknown as T;
}

export function removeSourceMap(definition: KDefinition): KDefinition {
  return onAttributes(definition, (att) => att.dropSource());
}

export function removeAttrs(term: KInner): KInner {
  function removeAttr(t: KInner): KInner {
    if (isWithKAtt(t)) {
      return t.letAtt(EMPTY_ATT) as unknown as KInner;
    }
    return t;
  }

  return topDown(removeAttr, term);
}

export function removeGeneratedCells(term: KInner): KInner {
  const rewrite = new KRewrite(
    new KApply(new KLabel("<generatedTop>"), [
      new KVariable("CONFIG"),
      new KVariable("_"),
    ]),
    new KVariable("CONFIG")
  );
  return rewrite.apply(term);
}

export function isAnonVar(kast: KInner): boolean {
  return kast instanceof KVariable && kast.name.startsWith("_");
}

export function setCell(
  constrainedTerm: KInner,
  cellVariable: string,
  cellValue: KInner
): KInner {
  const [state, constraint] = splitConfigAndConstraints(constrainedTerm);
  const [config, subst] = splitConfigFrom(state);
  subst[cellVariable] = cellValue;
  return mlAnd([new Subst(subst).apply(config), constraint]);
}

export function abstractTermSafely(
  kast: KInner,
  baseName: string = "V",
  sort?: KSort | null,
  existingVarNames?: Set<string>
): KVariable {
  function abstractFn(k: KInner): KVariable {
    const vname = hashStr(k.toString()).slice(0, 8);
    return new KVariable(baseName + "_" + vname, sort);
  }

  let newVar = abstractFn(kast);
  if (existingVarNames) {
    while (existingVarNames.has(newVar.name)) {
      newVar = abstractFn(newVar);
    }
  }
  return newVar;
}

export function applyExistentialSubstitutions(
  state: KInner,
  constraints: Iterable<KInner>
): [KInner, KInner[]] {
  const pattern = mlEqualsTrue(
    new KApply(new KLabel("_==K_"), [
      new KVariable("#VAR"),
      new KVariable("#VAL"),
    ])
  );
  const subst: Record<string, KInner> = {};
  const newConstraints: KInner[] = [];

  for (const c of constraints) {
    const match = pattern.match(c);
    if (
      match !== null &&
      match.get("#VAR") instanceof KVariable &&
      (match.get("#VAR") as KVariable).name.startsWith("?")
    ) {
      subst[(match.get("#VAR") as KVariable).name] = match.get("#VAR")!;
    } else {
      newConstraints.push(c);
    }
  }

  const substObj = new Subst(subst);
  return [substObj.apply(state), newConstraints.map((c) => substObj.apply(c))];
}

export function undoAliases(definition: KDefinition, kast: KInner): KInner {
  const aliases: KRewrite[] = [];
  for (const rule of definition.aliasRules) {
    const rewrite = rule.body;
    if (!(rewrite instanceof KRewrite)) {
      throw new Error(`Expected KRewrite as alias body, found: ${rewrite}`);
    }
    if (rule.requires !== null && rule.requires !== TRUE) {
      throw new Error(
        `Expected empty requires clause on alias, found: ${rule.requires}`
      );
    }
    if (rule.ensures !== null && rule.ensures !== TRUE) {
      throw new Error(
        `Expected empty ensures clause on alias, found: ${rule.ensures}`
      );
    }
    aliases.push(new KRewrite(rewrite.rhs, rewrite.lhs));
  }
  return indexedRewrite(kast, aliases);
}

export function renameGeneratedVars(term: KInner): KInner {
  const vars = new Set(freeVars(term));
  const cellStack: string[] = [];

  function renameVars(k: KInner): KInner {
    if (k instanceof KApply && k.isCell) {
      cellStack.push(cellLabelToVarName(k.label.name));
      const res = k.mapInner(renameVars);
      cellStack.pop();
      return res;
    }

    if (
      k instanceof KVariable &&
      (k.name.startsWith("_Gen") ||
        k.name.startsWith("?_Gen") ||
        k.name.startsWith("_DotVar") ||
        k.name.startsWith("?_DotVar"))
    ) {
      if (cellStack.length === 0) {
        return k;
      }
      const cellName = cellStack[cellStack.length - 1]!;
      const newVar = abstractTermSafely(k, cellName, k.sort, vars);
      vars.add(newVar.name);
      return newVar;
    }

    return k.mapInner(renameVars);
  }

  return renameVars(term);
}

export function isSpuriousConstraint(term: KInner): boolean {
  if (
    term instanceof KApply &&
    term.label.name === "#Equals" &&
    term.args[0] === term.args[1]
  ) {
    return true;
  }
  if (isTop(term, { weak: true })) {
    return true;
  }
  return false;
}

export function normalizeConstraints(constraints: Iterable<KInner>): KInner[] {
  const constraintList: KInner[] = [];
  for (const constraint of constraints) {
    constraintList.push(...flattenLabel("#And", constraint));
  }
  const constraintList2 = unique(constraintList);
  const constraintList3 = constraintList2.filter(
    (c) => !isSpuriousConstraint(c)
  );
  return Array.from(constraintList3);
}

export function removeUselessConstraints(
  constraints: Iterable<KInner>,
  initialVars: Iterable<string>
): KInner[] {
  let usedVars = Array.from(initialVars);
  let prevLenUsedVars = 0;
  const newConstraints: KInner[] = [];

  while (usedVars.length > prevLenUsedVars) {
    prevLenUsedVars = usedVars.length;
    for (const c of constraints) {
      if (!newConstraints.includes(c)) {
        const newVars = freeVars(c);
        if (Array.from(newVars).some((v) => usedVars.includes(v))) {
          newConstraints.push(c);
          usedVars.push(...newVars);
        }
      }
    }
    usedVars = Array.from(new Set(usedVars));
  }
  return newConstraints;
}

export function buildClaim(
  claimId: string,
  initConfig: KInner,
  finalConfig: KInner,
  initConstraints: Iterable<KInner> = [],
  finalConstraints: Iterable<KInner> = [],
  keepVars: Iterable<string> = []
): [KClaim, Subst] {
  const [rule, varMap] = buildRule(
    claimId,
    initConfig,
    finalConfig,
    initConstraints,
    finalConstraints,
    undefined,
    keepVars
  );
  const claim = new KClaim(rule.body, rule.requires, rule.ensures, rule.att);
  return [claim, varMap];
}

export function buildRule(
  ruleId: string,
  initConfig: KInner,
  finalConfig: KInner,
  initConstraints: Iterable<KInner> = [],
  finalConstraints: Iterable<KInner> = [],
  priority?: number,
  keepVars: Iterable<string> = [],
  defuncWith?: KDefinition
): [KRule, Subst] {
  let initConstraintsList = Array.from(initConstraints).map(normalizeMlPred);
  let finalConstraintsList = Array.from(finalConstraints).map(normalizeMlPred);
  finalConstraintsList = finalConstraintsList.filter(
    (c) => !initConstraintsList.includes(c)
  );

  if (defuncWith !== undefined) {
    const [newInitConfig, newConstraints] = defunctionalize(
      defuncWith,
      initConfig
    );
    initConfig = newInitConfig;
    initConstraintsList = [...initConstraintsList, ...newConstraints];
  }

  const initTerm = mlAnd([initConfig, ...initConstraintsList]);
  const finalTerm = mlAnd([finalConfig, ...finalConstraintsList]);

  const lhsVars = freeVars(initTerm);
  const rhsVars = freeVars(finalTerm);
  const occurrences = varOccurrences(
    mlAnd(
      [
        pushDownRewrites(new KRewrite(initConfig, finalConfig)),
        ...initConstraintsList,
        ...finalConstraintsList,
      ],
      GENERATED_TOP_CELL
    )
  );
  const sortedVars = keepVarsSorted(occurrences);
  const vSubst: Record<string, KVariable> = {};
  const vremapSubst: Record<string, KVariable> = {};

  for (const [v, vars] of occurrences.entries()) {
    let newV = v;
    if (vars.length === 1) {
      newV = "_" + newV;
    }
    if (rhsVars.has(v) && !lhsVars.has(v)) {
      newV = "?" + newV;
    }
    if (newV !== v) {
      vSubst[v] = new KVariable(newV, sortedVars.get(v)?.sort);
      vremapSubst[newV] = sortedVars.get(v)!;
    }
  }

  const newInitConfig = new Subst(vSubst).apply(initConfig);
  const newInitConstraints = initConstraintsList.map((c) =>
    new Subst(vSubst).apply(c)
  );
  const [newFinalConfig, newFinalConstraints] = applyExistentialSubstitutions(
    new Subst(vSubst).apply(finalConfig),
    finalConstraintsList.map((c) => new Subst(vSubst).apply(c))
  );

  const ruleBody = pushDownRewrites(
    new KRewrite(newInitConfig, newFinalConfig)
  );
  const ruleRequires = simplifyBool(mlPredToBool(mlAnd(newInitConstraints)));
  const ruleEnsures = simplifyBool(mlPredToBool(mlAnd(newFinalConstraints)));
  const attEntries =
    priority === undefined ? [] : [Atts.PRIORITY.call(String(priority))];
  const ruleAtt = new KAtt(attEntries);

  const rule = new KRule(ruleBody, ruleRequires, ruleEnsures, ruleAtt);
  const finalRule = updateAtts(rule, [Atts.LABEL.call(ruleId)]);

  return [finalRule, new Subst(vremapSubst)];
}

export function replaceRewritesWithImplies(kast: KInner): KInner {
  function replaceRewritesWithImpliesInner(k: KInner): KInner {
    if (k instanceof KRewrite) {
      return mlImplies(k.lhs, k.rhs);
    }
    return k;
  }

  return bottomUp(replaceRewritesWithImpliesInner, kast);
}

export function noCellRewriteToDots(term: KInner): KInner {
  function noCellRewriteToDotsInner(t: KInner): KInner {
    if (t instanceof KApply && t.isCell) {
      const lhs = extractLhs(t);
      const rhs = extractRhs(t);
      if (lhs === rhs) {
        return new KApply(t.label, [DOTS]);
      }
    }
    return t;
  }

  const [config, substMap] = splitConfigFrom(term);
  const subst = new Subst(
    Object.fromEntries(
      Object.entries(substMap).map(([cellName, cellContents]) => [
        cellName,
        noCellRewriteToDotsInner(cellContents),
      ])
    )
  );

  return subst.apply(config);
}

export function defunctionalize(
  defn: KDefinition,
  kinner: KInner
): [KInner, KInner[]] {
  const functionSymbols = defn.functions
    .map((prod) => prod.klabel)
    .filter((label) => label !== null);
  const constraints: KInner[] = [];

  function defunctionalizeInner(k: KInner): KInner {
    if (k instanceof KApply && functionSymbols.includes(k.label)) {
      const sort = defn.sort(k);
      if (!sort) {
        throw new Error(`Could not determine sort for: ${k}`);
      }
      const newVar = abstractTermSafely(k, "F", sort);
      const varConstraint = mlEquals(newVar, k, sort);
      constraints.push(varConstraint);
      return newVar;
    }
    return k;
  }

  const newKinner = topDown(defunctionalizeInner, kinner);
  return [newKinner, Array.from(unique(constraints))];
}
