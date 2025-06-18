import { single } from "../../utils";
import {
  KApply,
  KInner,
  KLabel,
  KSort,
  KVariable,
  buildAssoc,
  flattenLabel,
} from "../inner";
import { GENERATED_TOP_CELL, K, K_ITEM } from "./k";
import { BOOL, FALSE, TRUE } from "./kbool";

function _isTop(term: KInner): boolean {
  return term instanceof KApply && term.label.name === "#Top";
}

export function isTop(term: KInner, options: { weak?: boolean } = {}): boolean {
  const { weak = false } = options;

  if (_isTop(term)) {
    return true;
  }
  if (!weak) {
    return false;
  }

  const flat = flattenLabel("#And", term);
  if (flat.length === 1) {
    return isTop(single(flat));
  }
  return flat.every((t) => isTop(t, { weak: true }));
}

function _isBottom(term: KInner): boolean {
  return term instanceof KApply && term.label.name === "#Bottom";
}

export function isBottom(
  term: KInner,
  options: { weak?: boolean } = {}
): boolean {
  const { weak = false } = options;

  if (_isBottom(term)) {
    return true;
  }
  if (!weak) {
    return false;
  }

  const flat = flattenLabel("#And", term);
  if (flat.length === 1) {
    return isBottom(single(flat));
  }
  return flat.some((t) => isBottom(t, { weak: true }));
}

export function mlEquals(
  term1: KInner,
  term2: KInner,
  argSort: string | KSort = K,
  sort: string | KSort = GENERATED_TOP_CELL
): KApply {
  return new KLabel("#Equals", argSort, sort).apply(term1, term2);
}

export function mlEqualsTrue(
  term: KInner,
  sort: string | KSort = GENERATED_TOP_CELL
): KApply {
  return mlEquals(TRUE, term, BOOL, sort);
}

export function mlEqualsFalse(
  term: KInner,
  sort: string | KSort = GENERATED_TOP_CELL
): KApply {
  return mlEquals(FALSE, term, BOOL, sort);
}

export function mlTop(sort: string | KSort = GENERATED_TOP_CELL): KApply {
  return new KLabel("#Top", sort).apply();
}

export function mlBottom(sort: string | KSort = GENERATED_TOP_CELL): KApply {
  return new KLabel("#Bottom", sort).apply();
}

export function mlNot(
  term: KInner,
  sort: string | KSort = GENERATED_TOP_CELL
): KApply {
  return new KLabel("#Not", sort).apply(term);
}

export function mlAnd(
  conjuncts: Iterable<KInner>,
  sort: string | KSort = GENERATED_TOP_CELL
): KInner {
  const filtered = Array.from(conjuncts).filter((x) => !isTop(x));
  return buildAssoc(mlTop(sort), new KLabel("#And", sort), filtered);
}

export function mlOr(
  disjuncts: Iterable<KInner>,
  sort: string | KSort = GENERATED_TOP_CELL
): KInner {
  const filtered = Array.from(disjuncts).filter((x) => !isBottom(x));
  return buildAssoc(mlBottom(sort), new KLabel("#Or", sort), filtered);
}

export function mlImplies(
  antecedent: KInner,
  consequent: KInner,
  sort: string | KSort = GENERATED_TOP_CELL
): KApply {
  return new KLabel("#Implies", sort).apply(antecedent, consequent);
}

export function mlExists(
  variable: KVariable,
  body: KInner,
  sort1: string | KSort = K_ITEM,
  sort2: string | KSort = GENERATED_TOP_CELL
): KApply {
  return new KLabel("#Exists", sort1, sort2).apply(variable, body);
}

export function mlCeil(
  term: KInner,
  argSort: string | KSort = GENERATED_TOP_CELL,
  sort: string | KSort = GENERATED_TOP_CELL
): KApply {
  return new KLabel("#Ceil", argSort, sort).apply(term);
}
