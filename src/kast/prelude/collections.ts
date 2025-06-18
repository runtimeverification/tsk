import { KApply, KInner, KLabel, KSort, buildAssoc } from "../inner";

export const SET = new KSort("Set");
export const LIST = new KSort("List");
export const MAP = new KSort("Map");
export const RANGEMAP = new KSort("RangeMap");
export const BAG = new KSort("Bag");

export function setEmpty(): KInner {
  return new KApply(".Set");
}

export function setItem(k: KInner): KInner {
  return new KApply("SetItem", [k]);
}

export function setOf(ks: Iterable<KInner>): KInner {
  const items = Array.from(ks, (k) => setItem(k));
  return buildAssoc(setEmpty(), new KLabel("_Set_"), items);
}

export function listEmpty(): KInner {
  return new KApply(".List");
}

export function listItem(k: KInner): KInner {
  return new KApply("ListItem", [k]);
}

export function listOf(ks: Iterable<KInner>): KInner {
  const items = Array.from(ks, (k) => listItem(k));
  return buildAssoc(listEmpty(), new KLabel("_List_"), items);
}

export function mapEmpty(): KInner {
  return new KApply(".Map");
}

export function mapItem(k: KInner, v: KInner): KInner {
  return new KApply("_|->_", [k, v]);
}

export function mapOf(
  ks: Map<KInner, KInner> | Iterable<[KInner, KInner]>
): KInner {
  const entries = ks instanceof Map ? Array.from(ks.entries()) : Array.from(ks);
  const items = entries.map(([k, v]) => mapItem(k, v));
  return buildAssoc(mapEmpty(), new KLabel("_Map_"), items);
}

export function rangemapEmpty(): KInner {
  return new KApply(".RangeMap");
}

export function rangemapItem(k: [KInner, KInner], v: KInner): KInner {
  return new KApply("_r|->_", [new KApply("RangeMap:Range", k), v]);
}

export function rangemapOf(
  ks: Map<[KInner, KInner], KInner> | Iterable<[[KInner, KInner], KInner]>
): KInner {
  const entries = ks instanceof Map ? Array.from(ks.entries()) : Array.from(ks);
  const items = entries.map(([k, v]) => rangemapItem(k, v));
  return buildAssoc(rangemapEmpty(), new KLabel("_RangeMap_"), items);
}
