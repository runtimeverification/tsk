import { describe, expect, test } from "bun:test";
import {
  CSubst,
  CTerm,
  ctermBuildClaim,
  ctermBuildRule,
} from "../../cterm/cterm";
import { Atts, KAtt } from "../../kast/att";
import {
  KApply,
  KInner,
  KLabel,
  KRewrite,
  KSequence,
  KSort,
  KVariable,
  Subst,
} from "../../kast/inner";
import { KClaim } from "../../kast/outer";
import { GENERATED_TOP_CELL, K } from "../../kast/prelude/k";
import { TRUE } from "../../kast/prelude/kbool";
import { INT, geInt, intToken } from "../../kast/prelude/kint";
import {
  mlAnd,
  mlBottom,
  mlEquals,
  mlEqualsTrue,
  mlTop,
} from "../../kast/prelude/ml";
import { a, b, c, f, g, ge_ml, h, k, lt_ml, x, y, z } from "./utils";

// Test constants
const mem = new KLabel("<mem>");
const T = new KLabel("<T>");
const K_CELL = new KApply("<k>", [
  new KSequence([new KVariable("S1"), new KVariable("_DotVar0")]),
]);

const v1 = new KVariable("V1");
const v2 = new KVariable("V2");
const unds_v1 = new KVariable("_V1");
const ques_v2 = new KVariable("?V2");
const ques_unds_v2 = new KVariable("?_V2");
const v1_sorted = new KVariable("V1", INT);

// Helper function to create CTerm from KInner
function _asCterm(term: KInner): CTerm {
  return new CTerm(
    new KApply(new KLabel("<generatedTop>", GENERATED_TOP_CELL), [term])
  );
}

// Helper function to create constraint
function constraint(v: KVariable): KInner {
  return new KApply("_<=Int_", [intToken(0), v]);
}

// Test data for matching
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
];

const NO_MATCH_TEST_DATA: Array<[KInner, KInner]> = [[f(x, x), f(x, a)]];

const MATCH_WITH_CONSTRAINT_TEST_DATA: Array<[CTerm, CTerm]> = [
  [new CTerm(k.apply(x)), new CTerm(k.apply(x))],
  [new CTerm(k.apply(x)), new CTerm(k.apply(y))],
  [
    new CTerm(k.apply(x)),
    new CTerm(k.apply(y), [mlEqualsTrue(geInt(y, intToken(0)))]),
  ],
  [
    new CTerm(k.apply(x), [mlEqualsTrue(geInt(y, intToken(0)))]),
    new CTerm(k.apply(y), [
      mlEqualsTrue(geInt(y, intToken(0))),
      mlEqualsTrue(geInt(y, intToken(5))),
    ]),
  ],
];

const BUILD_RULE_TEST_DATA: Array<[KInner, KInner, string[], KInner]> = [
  [
    T.apply(
      k.apply(new KVariable("K_CELL", K)),
      mem.apply(new KVariable("MEM_CELL"))
    ),
    T.apply(
      k.apply(new KVariable("K_CELL")),
      mem.apply(
        new KApply("_[_<-_]", [
          new KVariable("MEM_CELL"),
          new KVariable("KEY"),
          new KVariable("VALUE"),
        ])
      )
    ),
    ["K_CELL"],
    T.apply(
      k.apply(new KVariable("_K_CELL", K)),
      mem.apply(
        new KRewrite(
          new KVariable("MEM_CELL"),
          new KApply("_[_<-_]", [
            new KVariable("MEM_CELL"),
            new KVariable("?_KEY"),
            new KVariable("?_VALUE"),
          ])
        )
      )
    ),
  ],
];

const BUILD_CLAIM_TEST_DATA: Array<[string, KInner, KInner, KClaim]> = [
  [
    "sorted-var-1",
    mlAnd([k.apply(v1_sorted), mlEqualsTrue(constraint(v1))]),
    k.apply(v2),
    new KClaim(
      k.apply(new KRewrite(v1_sorted, ques_unds_v2)),
      constraint(v1),
      mlTop(),
      new KAtt([Atts.LABEL.call("claim")])
    ),
  ],
  [
    "sorted-var-2",
    mlAnd([k.apply(v1), mlEqualsTrue(constraint(v1_sorted))]),
    k.apply(v2),
    new KClaim(
      k.apply(new KRewrite(v1, ques_unds_v2)),
      constraint(v1_sorted),
      mlTop(),
      new KAtt([Atts.LABEL.call("claim")])
    ),
  ],
  [
    "req-rhs",
    mlAnd([k.apply(v1), mlEqualsTrue(constraint(v2))]),
    k.apply(v2),
    new KClaim(
      k.apply(new KRewrite(unds_v1, v2)),
      constraint(v2),
      mlTop(),
      new KAtt([Atts.LABEL.call("claim")])
    ),
  ],
  [
    "free-rhs",
    k.apply(v1),
    k.apply(v2),
    new KClaim(
      k.apply(new KRewrite(unds_v1, ques_unds_v2)),
      mlTop(),
      mlTop(),
      new KAtt([Atts.LABEL.call("claim")])
    ),
  ],
  [
    "bound-rhs",
    k.apply(v1),
    mlAnd([k.apply(v2), mlEqualsTrue(constraint(v2))]),
    new KClaim(
      k.apply(new KRewrite(unds_v1, ques_v2)),
      mlTop(),
      constraint(ques_v2),
      new KAtt([Atts.LABEL.call("claim")])
    ),
  ],
];

const KAST_TEST_DATA: Array<[string, KInner, CTerm]> = [
  ["simple-bottom", new KApply("#Bottom"), CTerm.bottom()],
  ["simple-top", new KApply("#Top"), CTerm.top()],
  [
    "double-and-bottom",
    new KApply(new KLabel("#And", [new KSort("GeneratedTopCell")]), [
      new KApply(new KLabel("#Bottom", [new KSort("GeneratedTopCell")]), []),
      new KApply(new KLabel("#Bottom", [new KSort("GeneratedTopCell")]), []),
    ]),
    CTerm.bottom(),
  ],
];

const ML_PRED_TEST_DATA: Array<[string, CSubst, KInner]> = [
  ["empty", new CSubst(new Subst({})), mlTop()],
  [
    "singleton",
    new CSubst(new Subst({ X: TRUE })),
    mlEquals(new KVariable("X", K), TRUE, K),
  ],
  ["identity", new CSubst(new Subst({ X: new KVariable("X") })), mlTop()],
  [
    "double",
    new CSubst(new Subst({ X: TRUE, Y: intToken(4) })),
    mlAnd([
      mlEquals(new KVariable("X", K), TRUE, K),
      mlEquals(new KVariable("Y", K), intToken(4), K),
    ]),
  ],
];

const APPLY_TEST_DATA: Array<[CTerm, CSubst, CTerm]> = [
  [CTerm.top(), new CSubst(), CTerm.top()],
  [CTerm.bottom(), new CSubst(), CTerm.bottom()],
  [
    new CTerm(k.apply(new KVariable("X"))),
    new CSubst(),
    new CTerm(k.apply(new KVariable("X"))),
  ],
  [
    new CTerm(k.apply(new KVariable("X"))),
    new CSubst(new Subst({ X: intToken(5) })),
    new CTerm(k.apply(intToken(5))),
  ],
  [
    new CTerm(k.apply(new KVariable("X"))),
    new CSubst(new Subst({ X: new KVariable("Y") })),
    new CTerm(k.apply(new KVariable("Y"))),
  ],
  [
    new CTerm(k.apply(new KVariable("X")), [lt_ml("X", 5)]),
    new CSubst(new Subst({ X: new KVariable("Y") }), [ge_ml("Y", 0)]),
    new CTerm(k.apply(new KVariable("Y")), [ge_ml("Y", 0), lt_ml("Y", 5)]),
  ],
];

describe("CTerm", () => {
  describe("match and substitution", () => {
    MATCH_TEST_DATA.forEach(([term, pattern], index) => {
      test(`match test ${index + 1}`, () => {
        // When
        const subst = _asCterm(pattern).match(_asCterm(term));

        // Then
        expect(subst).not.toBeNull();
        expect(subst!.apply(pattern)).toEqual(term);
      });
    });
  });

  describe("no match cases", () => {
    NO_MATCH_TEST_DATA.forEach(([term, pattern], index) => {
      test(`no match test ${index + 1}`, () => {
        // When
        const subst = _asCterm(pattern).match(_asCterm(term));

        // Then
        expect(subst).toBeNull();
      });
    });
  });

  describe("match with constraint", () => {
    MATCH_WITH_CONSTRAINT_TEST_DATA.forEach(([t1, t2], index) => {
      test(`match with constraint test ${index + 1}`, () => {
        // When
        const cSubst1 = t1.matchWithConstraint(t2);

        // Then
        expect(cSubst1).not.toBeNull();
        expect(cSubst1!.apply(t1)).toEqual(t2);
      });
    });
  });

  describe("fromKast", () => {
    KAST_TEST_DATA.forEach(([testId, kast, expected]) => {
      test(`fromKast: ${testId}`, () => {
        // When
        const cterm = CTerm.fromKast(kast);

        // Then
        expect(cterm).toEqual(expected);
      });
    });
  });

  describe("static constructors", () => {
    test("top", () => {
      const top = CTerm.top();
      expect(top.config).toEqual(mlTop());
      expect(top.constraints.length).toBe(0);
    });

    test("bottom", () => {
      const bottom = CTerm.bottom();
      expect(bottom.config).toEqual(mlBottom());
      expect(bottom.constraints.length).toBe(0);
    });
  });

  describe("serialization", () => {
    test("toDict and fromDict", () => {
      // Given
      const original = new CTerm(k.apply(x), [
        mlEqualsTrue(geInt(x, intToken(0))),
      ]);

      // When
      const dict = original.toDict();
      const restored = CTerm.fromDict(dict);

      // Then
      expect(restored).toEqual(original);
    });
  });
});

describe("CSubst", () => {
  describe("ML predicate", () => {
    ML_PRED_TEST_DATA.forEach(([testId, csubst, pred]) => {
      test(`ML pred: ${testId}`, () => {
        expect(csubst.pred()).toEqual(pred);
      });
    });
  });

  describe("apply", () => {
    APPLY_TEST_DATA.forEach(([term, subst, expected], index) => {
      test(`apply test ${index + 1}`, () => {
        // When
        const actual = subst.apply(term);

        // Then
        expect(actual).toEqual(expected);
      });
    });
  });

  describe("serialization", () => {
    test("toDict and fromDict", () => {
      // Given
      const original = new CSubst(new Subst({ X: intToken(5) }), [
        mlEqualsTrue(geInt(new KVariable("Y"), intToken(0))),
      ]);

      // When
      const dict = original.toDict();
      const restored = CSubst.fromDict(dict);

      // Then
      expect(restored).toEqual(original);
    });
  });

  describe("static constructors", () => {
    test("fromPred", () => {
      // Given
      const pred = mlAnd([
        mlEquals(new KVariable("X"), intToken(5), K),
        mlEqualsTrue(geInt(new KVariable("Y"), intToken(0))),
      ]);

      // When
      const csubst = CSubst.fromPred(pred);

      // Then
      expect(csubst.subst.get("X")).toEqual(intToken(5));
      expect(csubst.constraints.length).toBeGreaterThan(0);
    });
  });
});

describe("ctermBuildRule", () => {
  BUILD_RULE_TEST_DATA.forEach(([lhs, rhs, keepVars, expected], index) => {
    test(`build rule test ${index + 1}`, () => {
      // When
      const [rule] = ctermBuildRule(
        "test-rule",
        CTerm.fromKast(lhs),
        CTerm.fromKast(rhs),
        undefined, // priority
        keepVars
      );
      const actual = rule.body;

      // Then
      expect(actual).toEqual(expected);
    });
  });
});

describe("ctermBuildClaim", () => {
  BUILD_CLAIM_TEST_DATA.forEach(([testId, init, target, expected]) => {
    test(`build claim: ${testId}`, () => {
      // Given
      const initCterm = CTerm.fromKast(init);
      const targetCterm = CTerm.fromKast(target);

      // When
      const [actual] = ctermBuildClaim("claim", initCterm, targetCterm);

      // Then
      expect(actual).toEqual(expected);
    });
  });
});

describe("CTerm properties", () => {
  test("isBottom", () => {
    expect(CTerm.bottom().isBottom).toBe(true);
    expect(CTerm.top().isBottom).toBe(false);
    expect(new CTerm(k.apply(x)).isBottom).toBe(false);
  });

  test("constraint getter", () => {
    const constraints = [mlEqualsTrue(geInt(x, intToken(0)))];
    const cterm = new CTerm(k.apply(x), constraints);
    expect(cterm.constraint).toEqual(mlAnd(constraints, GENERATED_TOP_CELL));
  });

  test("kast getter", () => {
    const config = k.apply(x);
    const constraints = [mlEqualsTrue(geInt(x, intToken(0)))];
    const cterm = new CTerm(config, constraints);
    expect(cterm.kast).toEqual(
      mlAnd([config, ...constraints], GENERATED_TOP_CELL)
    );
  });

  test("iterator", () => {
    const config = k.apply(x);
    const constraints = [mlEqualsTrue(geInt(x, intToken(0)))];
    const cterm = new CTerm(config, constraints);
    const items = Array.from(cterm);
    expect(items[0]).toEqual(config);
    expect(items.slice(1)).toEqual(constraints);
  });
});

describe("CSubst properties", () => {
  test("constraint getter", () => {
    const constraints = [mlEqualsTrue(geInt(x, intToken(0)))];
    const csubst = new CSubst(new Subst({}), constraints);
    expect(csubst.constraint).toEqual(mlAnd(constraints, GENERATED_TOP_CELL));
  });

  test("addConstraint", () => {
    const initialConstraints = [mlEqualsTrue(geInt(x, intToken(0)))];
    const newConstraint = mlEqualsTrue(geInt(y, intToken(5)));
    const csubst = new CSubst(new Subst({}), initialConstraints);

    const updated = csubst.addConstraint(newConstraint);

    expect(updated.constraints).toEqual([...initialConstraints, newConstraint]);
  });

  test("iterator", () => {
    const subst = new Subst({ X: intToken(5) });
    const constraints = [mlEqualsTrue(geInt(x, intToken(0)))];
    const csubst = new CSubst(subst, constraints);
    const items = Array.from(csubst);
    expect(items[0]).toEqual(subst);
    expect(items.slice(1)).toEqual(constraints);
  });
});
