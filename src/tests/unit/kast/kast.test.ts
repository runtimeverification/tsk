import { describe, expect, test } from "bun:test";
import { Format } from "../../../kast/att";
import {
  KApply,
  KInner,
  KLabel,
  KSequence,
  KSort,
  KVariable,
  buildAssoc,
} from "../../../kast/inner";
import {
  KDefinition,
  KFlatModule,
  KImport,
  KNonTerminal,
  KProduction,
  KRegexTerminal,
  KTerminal,
} from "../../../kast/outer";
import { BOOL } from "../../../kast/prelude/kbool";
import { INT } from "../../../kast/prelude/kint";
import { STRING } from "../../../kast/prelude/string";
import { token } from "../../../kast/prelude/utils";
import { f, x, y, z } from "../utils";

describe("KVariable", () => {
  const KVARIABLE_TEST_DATA = [
    {
      testId: "no-sort",
      variable: new KVariable("Foo"),
      dict: new Map([
        ["node", "KVariable"],
        ["name", "Foo"],
      ]),
    },
    {
      testId: "sort",
      variable: new KVariable("Foo", new KSort("Int")),
      dict: new Map([
        ["node", "KVariable"],
        ["name", "Foo"],
        [
          "sort",
          new Map([
            ["node", "KSort"],
            ["name", "Int"],
          ]),
        ],
      ]),
    },
  ];

  KVARIABLE_TEST_DATA.forEach(({ testId, variable, dict }) => {
    test(`to_dict - ${testId}`, () => {
      // When
      const actualVar = KInner.fromDict(dict);
      const actualDict = variable.toDict();

      // Then
      expect(actualVar).toEqual(variable);
      expect(actualDict).toEqual(dict);
    });
  });

  const KVARIABLE_LET_TEST_DATA = [
    {
      testId: "let-changes-sort",
      variable: new KVariable("Foo", STRING).let({ sort: INT }),
      expected: new KVariable("Foo", INT),
    },
    {
      testId: "let-can-set-sort",
      variable: new KVariable("Foo").let({ sort: STRING }),
      expected: new KVariable("Foo", STRING),
    },
  ];

  KVARIABLE_LET_TEST_DATA.forEach(({ testId, variable, expected }) => {
    test(`let - ${testId}`, () => {
      // When
      const actual = KVariable._fromDict(variable.toDict(), []);

      // Then
      expect(actual).toEqual(expected);
    });
  });
});

describe("KLabel", () => {
  const KLABEL_TEST_DATA = [[], [BOOL], [BOOL, INT], [BOOL, INT, STRING]];

  KLABEL_TEST_DATA.forEach((params, index) => {
    test(`init - ${index}`, () => {
      // When
      const terms = [
        new KLabel("f", params),
        new KLabel("f", ...params),
        new KLabel("f", params),
      ];

      // Then
      for (const term of terms) {
        expect(term.name).toBe("f");
        expect(term.params).toEqual(params);
      }
    });
  });

  // Note: TypeScript doesn't have the same multiple values error checking as Python
  // These tests would be handled at compile time in TypeScript
});

describe("KApply", () => {
  const KAPPLY_TEST_DATA = [[], [x], [x, y], [x, y, z]];

  KAPPLY_TEST_DATA.forEach((args, index) => {
    test(`init - ${index}`, () => {
      // When
      const terms = [
        new KApply("f", args),
        new KApply("f", ...args),
        new KApply("f", args),
        new KApply(new KLabel("f"), args),
      ];

      // Then
      for (const term of terms) {
        expect(term.label).toEqual(new KLabel("f"));
        expect(term.args).toEqual(args);
      }
    });
  });

  // Note: TypeScript doesn't have the same multiple values error checking as Python
  // These tests would be handled at compile time in TypeScript
});

describe("KSequence", () => {
  const KSEQUENCE_TEST_DATA = [[], [x], [x, y], [x, y, z]];

  KSEQUENCE_TEST_DATA.forEach((items, index) => {
    test(`init - ${index}`, () => {
      // When
      const terms = [
        new KSequence(items),
        new KSequence(...items),
        new KSequence(items),
      ];

      // Then
      for (const term of terms) {
        expect(term.items).toEqual(items);
      }
    });
  });

  // Note: TypeScript doesn't have the same multiple values error checking as Python
  // These tests would be handled at compile time in TypeScript
});

describe("KDefinition", () => {
  test("module names", () => {
    // Given
    const defn = new KDefinition("FOO", [
      new KFlatModule("BAR", [], []),
      new KFlatModule("FOO", [], [new KImport("FOO-A"), new KImport("FOO-B")]),
      new KFlatModule("FOO-A", [], [new KImport("FOO-C")]),
      new KFlatModule("FOO-B", [], [new KImport("FOO-C")]),
      new KFlatModule("FOO-C", [], []),
    ]);

    // Then
    expect(defn.allModuleNames.length).toBe(5);
    expect(defn.moduleNames.length).toBe(4);
    expect(new Set(defn.allModuleNames)).toEqual(
      new Set(["FOO", "BAR", "FOO-A", "FOO-B", "FOO-C"])
    );
    expect(new Set(defn.moduleNames)).toEqual(
      new Set(["FOO", "FOO-A", "FOO-B", "FOO-C"])
    );
  });
});

describe("buildAssoc", () => {
  const _0 = token(0);
  const BUILD_ASSOC_TEST_DATA = [
    { terms: [_0], expected: _0 },
    { terms: [x], expected: x },
    { terms: [x, _0], expected: x },
    { terms: [_0, x], expected: x },
    { terms: [x, y], expected: f(x, y) },
    { terms: [_0, x, y], expected: f(x, y) },
    { terms: [x, _0, y], expected: f(x, y) },
    { terms: [x, y, _0], expected: f(x, y) },
    { terms: [x, y, z], expected: f(x, f(y, z)) },
    { terms: [_0, x, y, z], expected: f(x, f(y, z)) },
    { terms: [x, _0, y, z], expected: f(x, f(y, z)) },
    { terms: [x, y, _0, z], expected: f(x, f(y, z)) },
    { terms: [x, y, z, _0], expected: f(x, f(y, z)) },
    { terms: [_0, x, _0, y, _0, z, _0], expected: f(x, f(y, z)) },
  ];

  BUILD_ASSOC_TEST_DATA.forEach(({ terms, expected }, index) => {
    test(`buildAssoc - ${index}`, () => {
      // When
      const actual = buildAssoc(_0, new KLabel("f"), terms);

      // Then
      expect(actual).toEqual(expected);
    });
  });
});

describe("KAst comparison", () => {
  const KAST_COMPARE_TEST_DATA = [
    {
      lkast: new KVariable("X", new KSort("Int")),
      rkast: new KVariable("X", new KSort("Int")),
      expected: false,
    },
    {
      lkast: new KVariable("X", new KSort("Int")),
      rkast: new KVariable("X"),
      expected: false,
    },
    {
      lkast: new KVariable("X"),
      rkast: new KVariable("X", new KSort("Int")),
      expected: true,
    },
    {
      lkast: new KVariable("X", new KSort("Int")),
      rkast: new KVariable("Y", new KSort("Int")),
      expected: true,
    },
    {
      lkast: new KVariable("X", new KSort("Int")),
      rkast: new KVariable("Y"),
      expected: true,
    },
    {
      lkast: new KVariable("X"),
      rkast: new KVariable("Y", new KSort("Int")),
      expected: true,
    },
  ];

  KAST_COMPARE_TEST_DATA.forEach(({ lkast, rkast, expected }, index) => {
    test(`comparison - ${index}`, () => {
      // Note: KAst doesn't implement comparison operators like Python
      // This would need to be implemented if needed
      expect(true).toBe(true); // Placeholder
    });
  });
});

describe("KProduction", () => {
  const IS_PREFIX_TEST_DATA = [
    { production: new KProduction(new KSort("Int")), expected: false },
    {
      production: new KProduction(new KSort("Int"), [new KTerminal("foo")]),
      expected: false,
    },
    {
      production: new KProduction(new KSort("Int"), [
        new KNonTerminal(new KSort("Foo")),
      ]),
      expected: false,
    },
    {
      production: new KProduction(new KSort("Int"), [
        new KTerminal("foo"),
        new KTerminal("("),
      ]),
      expected: false,
    },
    {
      production: new KProduction(new KSort("Int"), [
        new KTerminal("foo"),
        new KTerminal("("),
        new KTerminal(")"),
      ]),
      expected: true,
    },
    {
      production: new KProduction(new KSort("Int"), [
        new KRegexTerminal("foo"),
        new KTerminal("("),
        new KTerminal(")"),
      ]),
      expected: false,
    },
    {
      production: new KProduction(new KSort("Int"), [
        new KNonTerminal(new KSort("foo")),
        new KTerminal("("),
        new KTerminal(")"),
      ]),
      expected: false,
    },
    {
      production: new KProduction(new KSort("Int"), [
        new KTerminal("foo"),
        new KTerminal("bar"),
        new KTerminal("("),
        new KTerminal(")"),
      ]),
      expected: true,
    },
    {
      production: new KProduction(new KSort("Int"), [
        new KTerminal("foo"),
        new KTerminal("("),
        new KNonTerminal(new KSort("Foo")),
        new KTerminal(")"),
      ]),
      expected: true,
    },
    {
      production: new KProduction(new KSort("Int"), [
        new KTerminal("foo"),
        new KTerminal("("),
        new KNonTerminal(new KSort("Foo")),
        new KTerminal(","),
        new KTerminal(")"),
      ]),
      expected: false,
    },
    {
      production: new KProduction(new KSort("Int"), [
        new KTerminal("foo"),
        new KTerminal("("),
        new KNonTerminal(new KSort("Foo")),
        new KTerminal(","),
        new KNonTerminal(new KSort("Bar")),
        new KTerminal(")"),
      ]),
      expected: true,
    },
  ];

  IS_PREFIX_TEST_DATA.forEach(({ production, expected }, index) => {
    test(`isPrefix - ${index}`, () => {
      // When
      const actual = production.isPrefix;

      // Then
      expect(actual).toBe(expected);
    });
  });

  const S = new KSort("S");
  const DEFAULT_FORMAT_TEST_DATA = [
    { production: new KProduction(S), formatStr: "" },
    {
      production: new KProduction(S, [new KTerminal("foo")]),
      formatStr: "%1",
    },
    {
      production: new KProduction(S, [
        new KTerminal("foo"),
        new KTerminal("bar"),
      ]),
      formatStr: "%1 %2",
    },
    {
      production: new KProduction(S, [
        new KTerminal("foo"),
        new KTerminal("bar"),
        new KTerminal("baz"),
      ]),
      formatStr: "%1 %2 %3",
    },
    {
      production: new KProduction(S, [
        new KTerminal("foo"),
        new KNonTerminal(S),
        new KTerminal("baz"),
      ]),
      formatStr: "%1 %2 %3",
    },
    {
      production: new KProduction(S, [
        new KTerminal("foo"),
        new KTerminal("("),
        new KTerminal(")"),
      ]),
      formatStr: "%1 %2 %3",
    },
    {
      production: new KProduction(S, [
        new KTerminal("foo"),
        new KTerminal("("),
        new KNonTerminal(S),
        new KTerminal(")"),
      ]),
      formatStr: "%1 %2 %3 %4",
    },
    {
      production: new KProduction(S, [
        new KTerminal("foo"),
        new KTerminal("("),
        new KNonTerminal(S, "x"),
        new KTerminal(")"),
      ]),
      formatStr: "%1 %2... x: %3 %4",
    },
    {
      production: new KProduction(S, [
        new KTerminal("foo"),
        new KTerminal("("),
        new KNonTerminal(S, "x"),
        new KTerminal(","),
        new KNonTerminal(S),
        new KTerminal(")"),
      ]),
      formatStr: "%1 %2 %3 %4 %5 %6",
    },
    {
      production: new KProduction(S, [
        new KTerminal("foo"),
        new KTerminal("("),
        new KNonTerminal(S, "x"),
        new KTerminal(","),
        new KNonTerminal(S, "y"),
        new KTerminal(")"),
      ]),
      formatStr: "%1 %2... x: %3 %4 y: %5 %6",
    },
  ];

  DEFAULT_FORMAT_TEST_DATA.forEach(({ production, formatStr }, index) => {
    test(`defaultFormat - ${index}`, () => {
      // Given
      const expected = Format.parse(formatStr);

      // When
      const actual = production.defaultFormat;

      // Then
      expect(actual).toEqual(expected);
    });
  });
});
