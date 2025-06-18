import { KApply, KInner, KLabel, KSort, KToken } from "../inner";

export const K = new KSort("K");
export const K_ITEM = new KSort("KItem");
export const GENERATED_TOP_CELL = new KSort("GeneratedTopCell");

export const DOTS = new KToken("...", K);

export function inj(fromSort: KSort, toSort: KSort, term: KInner): KInner {
  return new KApply(new KLabel("inj", [fromSort, toSort]), [term]);
}
