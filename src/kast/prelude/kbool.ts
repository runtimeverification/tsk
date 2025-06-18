import { unique } from "../../utils.ts";
import { KApply, KInner, KLabel, KSort, KToken, buildAssoc } from "../inner.ts";

// TODO: Import from outer module when available
export const BOOL = new KSort("Bool");
export const TRUE = new KToken("true", BOOL);
export const FALSE = new KToken("false", BOOL);

export function boolToken(b: boolean): KToken {
  return b ? TRUE : FALSE;
}

export function andBool(items: Iterable<KInner>): KInner {
  return buildAssoc(TRUE, new KLabel("_andBool_"), unique(items));
}

export function orBool(items: Iterable<KInner>): KInner {
  return buildAssoc(FALSE, new KLabel("_orBool_"), unique(items));
}

export function notBool(item: KInner): KApply {
  return new KApply(new KLabel("notBool_"), [item]);
}

export function impliesBool(antecedent: KInner, consequent: KInner): KApply {
  return new KApply(new KLabel("_impliesBool_"), [antecedent, consequent]);
}
