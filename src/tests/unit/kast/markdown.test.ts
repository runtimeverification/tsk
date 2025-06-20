import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  And,
  Atom,
  Not,
  Or,
  SelectorParser,
  codeBlocks,
  parseTags,
  selectCodeBlocks,
  type CodeBlock,
} from "../../../kast/markdown";

// Test data directories
const CODE_BLOCKS_TEST_DIR = join(
  __dirname,
  "../test-data/markdown-code-blocks"
);
const SELECT_TEST_DIR = join(__dirname, "../test-data/markdown-select");

// Get test files
const CODE_BLOCKS_TEST_FILES = readdirSync(CODE_BLOCKS_TEST_DIR)
  .filter((file) => file.endsWith(".test"))
  .map((file) => join(CODE_BLOCKS_TEST_DIR, file));

const SELECT_TEST_FILES = readdirSync(SELECT_TEST_DIR)
  .filter((file) => file.endsWith(".test"))
  .map((file) => join(SELECT_TEST_DIR, file));

// Helper function to parse code blocks test data
function parseCodeBlocksTestData(testFile: string): [string, CodeBlock[]] {
  const lines = readFileSync(testFile, "utf-8").split("\n");
  const it = lines[Symbol.iterator]();

  function getText(): string {
    const textLines: string[] = [];

    while (true) {
      const line = it.next().value;
      if (line === "===") {
        break;
      }
      if (line !== undefined) {
        textLines.push(line);
      }
    }

    return textLines.join("\n");
  }

  function getBlocks(): CodeBlock[] {
    const blocks: CodeBlock[] = [];

    let la = it.next().value;

    while (la !== undefined) {
      const info = la;
      const codeLines: string[] = [];

      la = it.next().value;
      while (la !== undefined && la !== "---") {
        codeLines.push(la);
        la = it.next().value;
      }

      const code = codeLines.join("\n");
      blocks.push({ info, code });

      if (la) {
        // i.e. la === '---'
        la = it.next().value;
      }
    }

    return blocks;
  }

  const text = getText();
  const blocks = getBlocks();
  return [text, blocks];
}

// Helper function to parse select test data
function parseSelectTestData(
  testFile: string
): [string | null, string, string] {
  const lines = readFileSync(testFile, "utf-8").split("\n");
  const it = lines[Symbol.iterator]();

  const selector = it.next().value || null;

  const textLines: string[] = [];
  while (true) {
    const textLine = it.next().value;
    if (textLine === "===") {
      break;
    }
    if (textLine !== undefined) {
      textLines.push(textLine);
    }
  }
  const text = textLines.join("\n");

  const expectedLines: string[] = [];
  while (true) {
    const expectedLine = it.next().value;
    if (expectedLine === undefined) {
      break;
    }
    expectedLines.push(expectedLine);
  }
  const expected = expectedLines.join("\n");

  return [selector, text, expected];
}

// Test data for parser
const PARSER_TEST_DATA = [
  ["a", new Atom("a")],
  [" a ", new Atom("a")],
  ["(a)", new Atom("a")],
  ["((a))", new Atom("a")],
  ["foo", new Atom("foo")],
  ["!a", new Not(new Atom("a"))],
  ["a & b", new And([new Atom("a"), new Atom("b")])],
  ["a & b & c", new And([new Atom("a"), new Atom("b"), new Atom("c")])],
  [
    "a & (b & c)",
    new And([new Atom("a"), new And([new Atom("b"), new Atom("c")])]),
  ],
  ["!(a & b)", new Not(new And([new Atom("a"), new Atom("b")]))],
  [
    "(a & b) & c",
    new And([new And([new Atom("a"), new Atom("b")]), new Atom("c")]),
  ],
  [
    "a & !b & !c",
    new And([new Atom("a"), new Not(new Atom("b")), new Not(new Atom("c"))]),
  ],
  ["a | b", new Or([new Atom("a"), new Atom("b")])],
  ["a | b | c", new Or([new Atom("a"), new Atom("b"), new Atom("c")])],
  [
    "!a | !b | c",
    new Or([new Not(new Atom("a")), new Not(new Atom("b")), new Atom("c")]),
  ],
  [
    "a | b & !c",
    new Or([new Atom("a"), new And([new Atom("b"), new Not(new Atom("c"))])]),
  ],
  ["!(a | b)", new Not(new Or([new Atom("a"), new Atom("b")]))],
  [
    "(a | b) & !c",
    new And([new Or([new Atom("a"), new Atom("b")]), new Not(new Atom("c"))]),
  ],
  [
    "!a & b | c",
    new Or([new And([new Not(new Atom("a")), new Atom("b")]), new Atom("c")]),
  ],
  [
    "!a & (b | c)",
    new And([new Not(new Atom("a")), new Or([new Atom("b"), new Atom("c")])]),
  ],
] as const;

// Test data for evaluation
const EVAL_TEST_DATA: Array<[string, string[], boolean]> = [
  ["a", [], false],
  ["a", ["a"], true],
  ["a", ["a", "b"], true],
  ["a", ["b"], false],
  ["!a", [], true],
  ["!a", ["a"], false],
  ["!a", ["a", "b"], false],
  ["!a", ["b"], true],
  ["a & b", [], false],
  ["a & b", ["a"], false],
  ["a & b", ["b"], false],
  ["a & b", ["a", "b"], true],
  ["a | b", [], false],
  ["a | b", ["a"], true],
  ["a | b", ["b"], true],
  ["a | b", ["a", "b"], true],
  ["!a | b & c", [], true],
  ["!a | b & c", ["a"], false],
  ["!a | b & c", ["b", "c"], true],
  ["a & (!b | c)", [], false],
  ["a & (!b | c)", ["a"], true],
  ["a & (!b | c)", ["a", "b"], false],
  ["a & (!b | c)", ["a", "b", "c"], true],
];

// Test data for parse tags
const PARSE_TAGS_TEST_DATA = [
  ["", new Set<string>()],
  ["k", new Set(["k"])],
  ["{.foo .bar .baz}", new Set(["foo", "bar", "baz"])],
] as const;

// Helper function to generate eval test IDs
function evalId(text: string, atoms: string[], expected: boolean): string {
  const models = expected ? "|==" : "|=/=";
  return `{${atoms.join(",")}} ${models} ${text}`;
}

// Tests for code blocks parsing
describe("Markdown code blocks parsing", () => {
  CODE_BLOCKS_TEST_FILES.forEach((testFile) => {
    const fileName =
      testFile.split("/").pop()?.replace(".test", "") || "unknown";

    test(`code blocks test: ${fileName}`, () => {
      // Given
      const [text, expected] = parseCodeBlocksTestData(testFile);

      // When
      const actual = Array.from(codeBlocks(text));

      // Then
      expect(actual).toEqual(expected);
    });
  });
});

// Tests for selector parser
describe("Selector parser tests", () => {
  PARSER_TEST_DATA.forEach(([text, expected]) => {
    test(`parser test: ${text}`, () => {
      // Given
      const parser = new SelectorParser(text);

      // When
      const actual = parser.parse();

      // Then
      expect(actual).toEqual(expected);
    });
  });
});

// Tests for selector evaluation
describe("Selector evaluation tests", () => {
  EVAL_TEST_DATA.forEach(([text, atoms, expected]) => {
    test(`eval test: ${evalId(text, atoms, expected)}`, () => {
      // Given
      const parser = new SelectorParser(text);
      const selector = parser.parse();

      // When
      const actual = selector.eval(atoms);

      // Then
      expect(actual).toBe(expected);
    });
  });
});

// Tests for parse tags
describe("Parse tags tests", () => {
  PARSE_TAGS_TEST_DATA.forEach(([text, expected]) => {
    test(`parse tags test: ${text}`, () => {
      // When
      const actual = parseTags(text);

      // Then
      expect(actual).toEqual(expected);
    });
  });
});

// Tests for select code blocks
describe("Select code blocks tests", () => {
  SELECT_TEST_FILES.forEach((testFile) => {
    const fileName =
      testFile.split("/").pop()?.replace(".test", "") || "unknown";

    test(`select code blocks test: ${fileName}`, () => {
      // Given
      const [selector, text, expected] = parseSelectTestData(testFile);

      // When
      const actual = selectCodeBlocks(text, selector || undefined);

      // Then
      expect(actual).toBe(expected);
    });
  });
});
