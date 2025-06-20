import { describe, expect, test } from "bun:test";
import { KInner, KSequence } from "../../../kast/inner";
import { mlBottom, mlTop } from "../../../kast/prelude/ml";
import { a, b, c, f, g, h, x, y, z } from "../utils";

// Test data for patterns that should successfully match
const MATCH_TEST_DATA: Array<[KInner, KInner]> = [
  [a, a],
  [a, x],
  [f(a), x],
  [f(a), f(a)],
  [f(a), f(x)],
  [f(a, b), f(x, y)],
  [f(a, b, c), f(x, y, z)],
  [f(g(h(a))), f(x)],
  [f(g(h(x))), f(x)],
  [f(a, g(b, h(c))), f(x, y)],
  [new KSequence([a, x]), new KSequence([y])],
  [new KSequence([a, b, x]), new KSequence([a, y])],
  [new KSequence([f(a), b, x]), new KSequence([f(z), y])],
  [new KSequence([f(a), b, c, x]), new KSequence([f(z), y])],
];

// Test data for patterns that should not match
const NO_MATCH_TEST_DATA: Array<[KInner, KInner]> = [
  [f(x, x), f(x, a)],
  [mlTop(), mlBottom()],
  [new KSequence([a, b, c]), new KSequence([x, x])],
];

describe("match and substitution", () => {
  MATCH_TEST_DATA.forEach(([term, pattern], index) => {
    test(`successful match case ${index}`, () => {
      // When
      const subst = pattern.match(term);

      // Then
      expect(subst).not.toBeNull();
      expect(subst!.apply(pattern)).toEqual(term);
    });
  });
});

describe("no match", () => {
  NO_MATCH_TEST_DATA.forEach(([term, pattern], index) => {
    test(`no match case ${index}`, () => {
      // When
      const subst = pattern.match(term);

      // Then
      expect(subst).toBeNull();
    });
  });
});
