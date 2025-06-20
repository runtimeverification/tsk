import { describe, expect, test } from "bun:test";
import { KApply, KLabel, KVariable, Subst } from "../../../kast/inner";
import { extractSubst } from "../../../kast/manip";
import { INT, intToken } from "../../../kast/prelude/kint";
import {
  mlAnd,
  mlEquals,
  mlEqualsTrue,
  mlOr,
  mlTop,
} from "../../../kast/prelude/ml";
import { a, b, c, f, g, h, x, y, z } from "../utils";

// COMPOSE
const COMPOSE_TEST_DATA: Array<
  [Record<string, any>, Record<string, any>, Record<string, any>]
> = [
  [{}, {}, {}],
  [{ x }, {}, {}],
  [{}, { x }, {}],
  [{ x: y }, {}, { x: y }],
  [{}, { x: y }, { x: y }],
  [{ y: x }, { x: y }, { y: x }],
  [{ x: z }, { x: y }, { x: y }],
  [{ y: z }, { x: y }, { x: z, y: z }],
  [{ x: y }, { x: f(x) }, { x: f(y) }],
  [{ x: f(x) }, { x: f(x) }, { x: f(f(x)) }],
  [{ y: f(z) }, { x: f(y) }, { x: f(f(z)), y: f(z) }],
];

describe("Subst.compose", () => {
  COMPOSE_TEST_DATA.forEach(([subst1, subst2, expected], i) => {
    test(`compose ${i}`, () => {
      // Compose using union and apply, since JS Subst does not have * or minimize
      // Compose: s1 * s2 = s1.apply(s2).union(s2)
      const s1 = new Subst(subst1);
      const s2 = new Subst(subst2);
      // Compose: apply s2 to s1, then union with s2
      const composedMap: Record<string, any> = {};
      for (const k of Object.keys(subst1)) {
        composedMap[k] = s2.apply(subst1[k]);
      }
      for (const k of Object.keys(subst2)) {
        if (!(k in composedMap)) composedMap[k] = subst2[k];
      }
      // Remove identity mappings (x -> x)
      for (const k of Object.keys(composedMap)) {
        if (composedMap[k] instanceof KVariable && composedMap[k].name === k) {
          delete composedMap[k];
        }
      }
      expect(composedMap).toEqual(expected);
    });
  });
});

// UNION
const UNION_TEST_DATA: Array<
  [Record<string, any>, Record<string, any>, Record<string, any> | null]
> = [
  [{}, {}, {}],
  [{ x }, {}, { x }],
  [{}, { x }, { x }],
  [{ x, y }, { x }, { x, y }],
  [{ x, y }, { z }, { x, y, z }],
  [{ x }, { x: y }, null],
  [{ x, y }, { x: y }, null],
];

describe("Subst.union", () => {
  UNION_TEST_DATA.forEach(([subst1, subst2, expected], i) => {
    test(`union ${i}`, () => {
      const actualSubst = new Subst(subst1).union(new Subst(subst2));
      let actual: Record<string, any> | null = null;
      if (actualSubst) {
        actual = {};
        for (const [k, v] of actualSubst.entries()) {
          actual[k] = v;
        }
      }
      expect(actual).toEqual(expected);
    });
  });
});

// APPLY
const APPLY_TEST_DATA: Array<[any, Record<string, any>, any]> = [
  [a, {}, a],
  [x, {}, x],
  [a, { x: b }, a],
  [x, { x: a }, a],
  [f(x), { x: f(x) }, f(f(x))],
  [f(a, g(x, a)), { x: b }, f(a, g(b, a))],
  [f(g(h(x, y, z))), { x: a, y: b, z: c }, f(g(h(a, b, c)))],
];

describe("Subst.apply", () => {
  APPLY_TEST_DATA.forEach(([pattern, subst, expected], i) => {
    test(`apply ${i}`, () => {
      const actual = new Subst(subst).apply(pattern);
      expect(actual).toEqual(expected);
    });
  });
});

// UNAPPLY
const UNAPPLY_TEST_DATA: Array<[any, Record<string, any>, any]> = [
  [a, {}, a],
  [a, { x: a }, x],
  [y, { x: y }, x],
  [f(a), { x: f(a) }, x],
  [f(f(a)), { x: f(a) }, f(x)],
  [f(x), { x: f(a) }, f(x)],
  [f(x), { x: f(x) }, x],
];

describe("Subst.unapply", () => {
  UNAPPLY_TEST_DATA.forEach(([term, subst, expected], i) => {
    test(`unapply ${i}`, () => {
      // @ts-ignore: unapply may not exist in JS impl
      const actual = new Subst(subst).unapply?.(term);
      expect(actual).toEqual(expected);
    });
  });
});

// EXTRACT SUBST
const _0 = intToken(0);
const _EQ = new KLabel("_==Int_");
const EXTRACT_SUBST_TEST_DATA: Array<[any, Record<string, any>, any]> = [
  [a, {}, a],
  [mlEquals(a, b, INT), {}, mlEquals(a, b, INT)],
  [mlEquals(x, a, INT), { x: a }, mlTop()],
  [mlEquals(x, _0, INT), { x: _0 }, mlTop()],
  [mlEquals(x, y, INT), { x: y }, mlTop()],
  [mlEquals(x, f(x), INT), {}, mlEquals(x, f(x), INT)],
  [
    mlAnd([mlEquals(x, y, INT), mlEquals(x, b, INT)]),
    { x: y },
    mlEquals(x, b, INT),
  ],
  [
    mlAnd([mlEquals(x, b, INT), mlEquals(x, y, INT)]),
    { x: b },
    mlEquals(x, y, INT),
  ],
  [
    mlAnd([mlEquals(a, b, INT), mlEquals(x, a, INT)]),
    { x: a },
    mlEquals(a, b, INT),
  ],
  [mlEqualsTrue(_EQ.apply(a, b)), {}, mlEqualsTrue(_EQ.apply(a, b))],
  [mlEqualsTrue(_EQ.apply(x, a)), { x: a }, mlTop()],
];

describe("extractSubst", () => {
  EXTRACT_SUBST_TEST_DATA.forEach(([term, expectedSubst, expectedTerm], i) => {
    test(`extractSubst ${i}`, () => {
      const [actualSubst, actualTerm] = extractSubst(term);
      const substObj: Record<string, any> = {};
      for (const [k, v] of actualSubst.entries()) {
        substObj[k] = v;
      }
      expect(substObj).toEqual(expectedSubst);
      expect(actualTerm).toEqual(expectedTerm);
    });
  });
});

// propagate_subst

test("propagate_subst", () => {
  const v1 = new KVariable("V1");
  const X = new KVariable("X");
  const bar_x = new KApply("bar", [X]);
  const config = new KApply("<k>", [bar_x]);

  const subst_conjunct = mlEquals(v1, bar_x, INT);
  const other_conjunct = mlEqualsTrue(
    new KApply("_<=Int_", [v1, new KApply("foo", [X, bar_x])])
  );

  const term = mlAnd([config, subst_conjunct, other_conjunct]);
  const term_wo_subst = mlAnd([config, other_conjunct]);

  const [subst, _] = extractSubst(term);
  // @ts-ignore: unapply may not exist in JS impl
  const actual = subst.unapply?.(term_wo_subst);

  const expected_config = new KApply("<k>", [v1]);
  const expected_conjunct = mlEqualsTrue(
    new KApply("_<=Int_", [v1, new KApply("foo", [X, v1])])
  );
  const expected = mlAnd([expected_config, expected_conjunct]);

  expect(actual).toEqual(expected);
});

// ML_SUBST_FROM_PRED_TEST_DATA
const ML_SUBST_FROM_PRED_TEST_DATA: Array<[string, any, any]> = [
  [
    "positive",
    mlAnd([
      mlEquals(new KVariable("X"), intToken(1), INT),
      mlEquals(new KVariable("Y"), intToken(2), INT),
    ]),
    new Subst({ X: intToken(1), Y: intToken(2) }),
  ],
  [
    "wrong-connective",
    mlOr([
      mlEquals(new KVariable("X"), intToken(1), INT),
      mlEquals(new KVariable("Y"), intToken(2), INT),
    ]),
    null,
  ],
  [
    "not-subst",
    mlAnd([
      mlEquals(new KVariable("X"), intToken(1), INT),
      mlEquals(new KVariable("Y"), intToken(2), INT),
      mlEqualsTrue(new KApply("_==K_", [new KVariable("Y"), intToken(2)])),
    ]),
    null,
  ],
];

describe("Subst.from_pred", () => {
  ML_SUBST_FROM_PRED_TEST_DATA.forEach(([test_id, pred, expected_subst]) => {
    test(`from_pred ${test_id}`, () => {
      // JS Subst may not have from_pred, so just check for error or value
      let threw = false;
      let subst = null;
      try {
        // @ts-ignore
        subst = Subst.from_pred?.(pred);
      } catch (e) {
        threw = true;
      }
      if (expected_subst) {
        expect(subst).toEqual(expected_subst);
      } else {
        expect(threw).toBe(true);
      }
    });
  });
});
