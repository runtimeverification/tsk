import { describe, expect, test } from "bun:test";
import { countVars } from "../../../kast/manip";
import { a, b, c, f, g, h, x, y, z } from "../utils";

// Test data: array of [term, expected] pairs
const TEST_DATA: Array<[any, Record<string, number>]> = [
  [a, {}],
  [x, { x: 1 }],
  [f(a), {}],
  [f(a, b, c), {}],
  [f(x), { x: 1 }],
  [f(f(f(x))), { x: 1 }],
  [f(x, a), { x: 1 }],
  [f(x, x), { x: 2 }],
  [f(x, y), { x: 1, y: 1 }],
  [f(x, y, z), { x: 1, y: 1, z: 1 }],
  [f(x, g(y), h(z)), { x: 1, y: 1, z: 1 }],
  [f(x, a, g(y, b), h(z, c)), { x: 1, y: 1, z: 1 }],
  [f(x, g(x, y), h(x, z)), { x: 3, y: 1, z: 1 }],
  [f(x, g(x, h(x, y, z))), { x: 3, y: 1, z: 1 }],
];

describe("count_vars", () => {
  TEST_DATA.forEach(([term, expected], index) => {
    test(`test case ${index}`, () => {
      // When
      const actual = countVars(term);

      // Then
      const actualObject = actual.toObject();
      expect(actualObject).toEqual(expected);
    });
  });
});
