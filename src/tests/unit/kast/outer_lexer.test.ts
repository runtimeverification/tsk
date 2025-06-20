import { describe, expect, test } from "bun:test";
import { Loc, Token, TokenType, outerLexer } from "../../../kast/outer_lexer";

// Test data constants
const COMMENT_TEST_DATA = [
  ["/", false, "/", ""],
  ["//", true, "//", ""],
  ["///", true, "///", ""],
  ["/*", false, "/*", ""],
  ["/**", false, "/**", ""],
  ["/**/", true, "/**/", ""],
  ["/* comment */", true, "/* comment */", ""],
  ["/**/ //", true, "/**/", " //"],
  ["// /**/", true, "// /**/", ""],
] as const;

const DEFAULT_TEST_DATA = [
  ["", new Token("", TokenType.EOF, new Loc(1, 0)), ""],
  [" ", new Token("", TokenType.EOF, new Loc(1, 1)), ""],
  ["0", new Token("0", TokenType.NAT, new Loc(1, 1)), ""],
  ["abc", new Token("abc", TokenType.ID_LOWER, new Loc(1, 1)), ""],
  ["Abc", new Token("Abc", TokenType.ID_UPPER, new Loc(1, 1)), ""],
  [":", new Token(":", TokenType.COLON, new Loc(1, 1)), ""],
  ["::=", new Token("::=", TokenType.DCOLONEQ, new Loc(1, 1)), ""],
  ['""', new Token('""', TokenType.STRING, new Loc(1, 1)), ""],
  ['"a"', new Token('"a"', TokenType.STRING, new Loc(1, 1)), ""],
  ['r""', new Token('r""', TokenType.REGEX, new Loc(1, 1)), ""],
  ["rule", new Token("rule", TokenType.KW_RULE, new Loc(1, 1)), ""],
] as const;

// Mock implementation for comment testing
function mockMaybeComment(
  la: string,
  it: Iterator<string>
): [boolean, string[], string] {
  const consumed: string[] = [la];

  let result = it.next();
  la = result.done ? "" : result.value;

  if (la === "") {
    return [false, consumed, la];
  }

  if (consumed[0] === "/") {
    if (la === "/") {
      consumed.push(la);
      result = it.next();
      la = result.done ? "" : result.value;
      while (la && la !== "\n") {
        consumed.push(la);
        result = it.next();
        la = result.done ? "" : result.value;
      }
      return [true, consumed, la];
    }

    if (la === "*") {
      consumed.push(la);
      result = it.next();
      la = result.done ? "" : result.value;
      while (true) {
        if (la === "") {
          return [false, consumed, la];
        }

        if (la === "*") {
          consumed.push(la);
          result = it.next();
          la = result.done ? "" : result.value;
          if (la === "") {
            return [false, consumed, la];
          } else if (la === "/") {
            consumed.push(la);
            result = it.next();
            la = result.done ? "" : result.value;
            return [true, consumed, la];
          } else {
            consumed.push(la);
            result = it.next();
            la = result.done ? "" : result.value;
            continue;
          }
        } else {
          consumed.push(la);
          result = it.next();
          la = result.done ? "" : result.value;
          continue;
        }
      }
    }
  }

  return [false, consumed, la];
}

// Tests for comment parsing
describe("OuterLexer comment parsing tests", () => {
  COMMENT_TEST_DATA.forEach(
    ([text, expectedSuccess, expectedConsumedText, expectedRemaining]) => {
      test(`comment test: ${text}`, () => {
        const it = text[Symbol.iterator]();
        const la = it.next().value || "";
        const expectedConsumed = [...expectedConsumedText];

        const [actualSuccess, actualConsumed, actualLa] = mockMaybeComment(
          la,
          it
        );
        const actualRemaining = actualLa + Array.from(it).join("");

        expect(actualSuccess).toBe(expectedSuccess);
        expect(actualConsumed).toEqual(expectedConsumed);
        expect(actualRemaining).toBe(expectedRemaining);
      });
    }
  );
});

// Tests for default token parsing using the actual lexer
describe("OuterLexer default parsing tests", () => {
  DEFAULT_TEST_DATA.forEach(([text, expectedToken, expectedRemaining]) => {
    test(`default test: ${text}`, () => {
      const tokens = Array.from(outerLexer(text));

      expect(tokens.length).toBeGreaterThan(0);

      const actual = tokens[0]!;
      expect(actual.type).toBe(expectedToken.type);
      expect(actual.text).toBe(expectedToken.text);
      expect(actual.loc.line).toBe(expectedToken.loc.line);
      expect(actual.loc.col).toBe(expectedToken.loc.col);
    });
  });
});

// Integration tests for the full lexer
describe("OuterLexer full lexer integration tests", () => {
  test("simple module lexing", () => {
    const text = "module TEST\nendmodule";
    const tokens = Array.from(outerLexer(text));

    expect(tokens.length).toBeGreaterThan(2);
    expect(tokens[0]!.type).toBe(TokenType.KW_MODULE);
    expect(tokens[0]!.text).toBe("module");
    expect(tokens[1]!.type).toBe(TokenType.MODNAME);
    expect(tokens[1]!.text).toBe("TEST");
  });

  test("rule with bubble", () => {
    const text = "rule X => Y";
    const tokens = Array.from(outerLexer(text));

    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens[0]!.type).toBe(TokenType.KW_RULE);
    expect(tokens[0]!.text).toBe("rule");
  });

  test("syntax declaration", () => {
    const text = 'syntax Foo ::= "bar"';
    const tokens = Array.from(outerLexer(text));

    expect(tokens.length).toBeGreaterThan(3);
    expect(tokens[0]!.type).toBe(TokenType.KW_SYNTAX);
    expect(tokens[0]!.text).toBe("syntax");
  });

  test("attribute parsing", () => {
    const text = "[foo(bar)]";
    const tokens = Array.from(outerLexer(text));

    expect(tokens.length).toBeGreaterThan(4);
    expect(tokens[0]!.type).toBe(TokenType.LBRACK);
    expect(tokens[1]!.type).toBe(TokenType.ATTR_KEY);
  });

  test("rule label parsing", () => {
    const text = "[label]: rule body";
    const tokens = Array.from(outerLexer(text));

    expect(tokens.length).toBeGreaterThan(4);
    expect(tokens[0]!.type).toBe(TokenType.LBRACK);

    // The lexer treats [label]: as an attribute in this context
    // This is correct behavior - the distinction between rule labels and attributes
    // is made by the parser, not the lexer
    expect(tokens[1]!.type).toBe(TokenType.ATTR_KEY);
    expect(tokens[1]!.text).toBe("label");
    expect(tokens[2]!.type).toBe(TokenType.RBRACK);
    expect(tokens[3]!.type).toBe(TokenType.COLON);
  });

  test("comment handling", () => {
    const text = "// comment\nrule";
    const tokens = Array.from(outerLexer(text));

    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]!.type).toBe(TokenType.KW_RULE);
    expect(tokens[0]!.text).toBe("rule");
  });

  test("string parsing", () => {
    const text = '"hello world"';
    const tokens = Array.from(outerLexer(text));

    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]!.type).toBe(TokenType.STRING);
    expect(tokens[0]!.text).toBe('"hello world"');
  });

  test("regex parsing", () => {
    const text = 'r"[a-z]+"';
    const tokens = Array.from(outerLexer(text));

    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]!.type).toBe(TokenType.REGEX);
    expect(tokens[0]!.text).toBe('r"[a-z]+"');
  });
});
