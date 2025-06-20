import { describe, expect, test } from "bun:test";
import type { Token } from "../../../kast/lexer";
import { TokenType, lexer } from "../../../kast/lexer";

const TT = TokenType;

// Helper function to create a token
function token(text: string, type: TokenType): Token {
  return { text, type };
}

const TEST_DATA: Array<[string, Token[]]> = [
  ["", []],
  ["\n", []],
  ["(", [token("(", TT.LPAREN)]],
  [")", [token(")", TT.RPAREN)]],
  [",", [token(",", TT.COMMA)]],
  ["~>", [token("~>", TT.KSEQ)]],
  [".K", [token(".K", TT.DOTK)]],
  [".KList", [token(".KList", TT.DOTKLIST)]],
  ["``", [token("``", TT.KLABEL)]],
  ["`\\x`", [token("`\\x`", TT.KLABEL)]],
  ["`\\``", [token("`\\``", TT.KLABEL)]],
  ["`foo`", [token("`foo`", TT.KLABEL)]],
  ['""', [token('""', TT.STRING)]],
  ['"\\x"', [token('"\\x"', TT.STRING)]],
  ['"\\""', [token('"\\""', TT.STRING)]],
  ['"foo"', [token('"foo"', TT.STRING)]],
  ["foo", [token("foo", TT.ID)]],
  ["#foo", [token("#foo", TT.ID)]],
  ["#token", [token("#token", TT.TOKEN)]],
  ["fO0", [token("fO0", TT.ID)]],
  ["_", [token("_", TT.VARIABLE)]],
  ["?_", [token("?_", TT.VARIABLE)]],
  ["X", [token("X", TT.VARIABLE)]],
  ["?X", [token("?X", TT.VARIABLE)]],
  ["_X", [token("_X", TT.VARIABLE)]],
  ["?_X", [token("?_X", TT.VARIABLE)]],
  ["Foo", [token("Foo", TT.VARIABLE)]],
  ["?Foo", [token("?Foo", TT.VARIABLE)]],
  ["_Foo", [token("_Foo", TT.VARIABLE)]],
  ["?_Foo", [token("?_Foo", TT.VARIABLE)]],
  [
    "X:Int",
    [token("X", TT.VARIABLE), token(":", TT.COLON), token("Int", TT.SORT)],
  ],
  [
    '`_+_`(#token("1", "Int"), X)',
    [
      token("`_+_`", TT.KLABEL),
      token("(", TT.LPAREN),
      token("#token", TT.TOKEN),
      token("(", TT.LPAREN),
      token('"1"', TT.STRING),
      token(",", TT.COMMA),
      token('"Int"', TT.STRING),
      token(")", TT.RPAREN),
      token(",", TT.COMMA),
      token("X", TT.VARIABLE),
      token(")", TT.RPAREN),
    ],
  ],
];

describe("lexer", () => {
  TEST_DATA.forEach(([text, expectedTokens]) => {
    test(`lexer: ${JSON.stringify(text)}`, () => {
      // Given
      const expected = [...expectedTokens, token("", TT.EOF)];

      // When
      const actual = Array.from(lexer(text));

      // Then
      expect(actual).toEqual(expected);
    });
  });
});
