import { describe, expect, test } from "bun:test";
import { KApply, KSequence, KToken, KVariable } from "../../../kast/inner";
import { KAstParser } from "../../../kast/parser";

describe("KAstParser", () => {
  const TEST_DATA: Array<[string, any]> = [
    ["_", new KVariable("_")],
    ["X", new KVariable("X")],
    ["X:Int", new KVariable("X", "Int")],
    ['#token("1", "Int")', new KToken("1", "Int")],
    ['#token("\\"foo\\"", "String")', new KToken('"foo"', "String")],
    [".K", new KSequence()],
    ["foo(.KList)", new KApply("foo")],
    [
      '`_+_`(#token("1", "Int"), X)',
      new KApply("_+_", new KToken("1", "Int"), new KVariable("X")),
    ],
    ["`\\``(.KList)", new KApply("`")],
    ["`_\\\\_`(.KList)", new KApply("_\\_")],
    [
      "`<k>`(foo(.KList) ~> bar(.KList))",
      new KApply("<k>", new KSequence([new KApply("foo"), new KApply("bar")])),
    ],
  ];

  TEST_DATA.forEach(([text, expected]) => {
    test(`parses ${text}`, () => {
      // Given
      const parser = new KAstParser(text);

      // When
      const actual = parser.k();

      // Then
      expect(parser.eof()).toBe(true);
      expect(actual).toEqual(expected);
    });
  });
});
