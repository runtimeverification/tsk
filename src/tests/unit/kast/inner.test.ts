import { describe, expect, test } from "bun:test";
import {
  KInner,
  KVariable,
  flattenLabel,
  keepVarsSorted,
} from "../../../kast/inner";
import { a, f, g, x, y, z } from "../utils";

// Test data for flatten_label function
const FLATTEN_LABEL_DATA: Array<[string, KInner, KInner[]]> = [
  ["a", a, []],
  ["b", a, [a]],
  ["x", x, [x]],
  ["y", x, [x]],
  ["f", f(x), [x]],
  ["g", f(x), [f(x)]],
  ["f", f(x, y), [x, y]],
  ["f", f(x, x), [x, x]],
  ["f", f(x, y, z), [x, y, z]],
  ["f", f(f(x)), [x]],
  ["f", f(f(f(x))), [x]],
  ["f", f(g(f(x))), [g(f(x))]],
  ["f", f(f(x, y, z)), [x, y, z]],
  ["f", f(x, f(y, x, f(y)), z), [x, y, x, y, z]],
  ["f", f(x, f(y, x, f(g(f(y))), z)), [x, y, x, g(f(y)), z]],
];

describe("flatten_label", () => {
  FLATTEN_LABEL_DATA.forEach(([label, kast, expected], index) => {
    test(`test case ${index}`, () => {
      // When
      const actual = flattenLabel(label, kast);

      // Then
      expect(actual).toEqual(expected);
    });
  });
});

// Test data for keep_vars_sorted function
const KEEP_VARS_SORTED_DATA: Array<
  [Record<string, KVariable[]>, Record<string, KVariable>]
> = [
  [
    {
      a: [new KVariable("a"), new KVariable("a")],
      b: [new KVariable("b"), new KVariable("b")],
    },
    { a: new KVariable("a"), b: new KVariable("b") },
  ],
  [
    {
      a: [new KVariable("a", "K"), new KVariable("a", "X")],
      b: [new KVariable("b", "K"), new KVariable("b", "X")],
    },
    { a: new KVariable("a"), b: new KVariable("b") },
  ],
  [
    {
      a: [new KVariable("a", "K"), new KVariable("a")],
      b: [new KVariable("b", "K"), new KVariable("b", "K")],
    },
    { a: new KVariable("a", "K"), b: new KVariable("b", "K") },
  ],
  [
    {
      a: [new KVariable("a", "A"), new KVariable("a"), new KVariable("a", "B")],
    },
    { a: new KVariable("a") },
  ],
];

describe("keep_vars_sorted", () => {
  KEEP_VARS_SORTED_DATA.forEach(([occurrences, expected], index) => {
    test(`test case ${index}`, () => {
      // When
      const occurrencesMap = new Map(Object.entries(occurrences));
      const actual = keepVarsSorted(occurrencesMap);

      // Then
      const actualObject = Object.fromEntries(actual.entries());
      expect(actualObject).toEqual(expected);
    });
  });
});
