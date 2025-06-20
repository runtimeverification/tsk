import { describe, expect, test } from "bun:test";
import { astToKast } from "../../../kast/_ast_to_kast";
import { EMPTY_ATT, KAtt } from "../../../kast/att";
import {
  KDefinition,
  KFlatModule,
  KImport,
  KRequire,
} from "../../../kast/outer";
import {
  Att,
  Definition,
  Import,
  Module,
  Require,
} from "../../../kast/outer_syntax";

// Test data for basic AST to KAST conversions
const AST_TO_KAST_TEST_DATA: Array<[any, any]> = [
  [new Import("A"), new KImport("A")],
  [new Import("B", false), new KImport("B", false)],
  [new Require("domains.md"), new KRequire("domains.md")],
  [new Module("MAIN"), new KFlatModule("MAIN")],
  [new Att([]), EMPTY_ATT],
  [
    new Att([["concrete", ""]]),
    KAtt.fromDict(new Map([["att", new Map([["concrete", ""]])]])),
  ],
];

describe("ast_to_kast", () => {
  AST_TO_KAST_TEST_DATA.forEach(([ast, expected], index) => {
    test(`test case ${index}`, () => {
      // When
      const actual = astToKast(ast);

      // Then
      expect(actual).toEqual(expected);
    });
  });
});

// Test data for AST to KAST conversions with additional arguments
const AST_TO_KAST_ARGS_TEST_DATA: Array<[any, any, Record<string, any>]> = [
  [
    new Definition([new Module("MAIN")], []),
    new KDefinition("MAIN", [new KFlatModule("MAIN")]),
    { mainModule: "MAIN" },
  ],
];

describe("ast_to_kast_args", () => {
  AST_TO_KAST_ARGS_TEST_DATA.forEach(([ast, expected, kwargs], index) => {
    test(`test case ${index}`, () => {
      // When
      const actual = astToKast(ast, kwargs.mainModule);

      // Then
      expect(actual).toEqual(expected);
    });
  });
});
