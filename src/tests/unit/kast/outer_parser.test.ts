import { describe, expect, test } from "bun:test";
import { OuterParser } from "../../../kast/outer_parser";
import {
  Alias,
  Assoc,
  Att,
  Claim,
  Config,
  Context,
  Definition,
  Import,
  Lexical,
  Module,
  NonTerminal,
  PriorityBlock,
  Production,
  Require,
  Rule,
  Sort,
  SortDecl,
  SyntaxAssoc,
  SyntaxDecl,
  SyntaxDefn,
  SyntaxLexical,
  SyntaxPriority,
  SyntaxSynonym,
  Terminal,
  UserList,
  type AST,
} from "../../../kast/outer_syntax";

// Test data for sentence parsing
const SENTENCE_TEST_DATA: Array<[string, AST]> = [
  ["rule x", new Rule("x")],
  ["rule [label]: x", new Rule("x", "label")],
  [
    "rule x [key1, key2(value)]",
    new Rule(
      "x",
      "",
      new Att([
        ["key1", ""],
        ["key2", "value"],
      ])
    ),
  ],
  ['rule x [key("value")]', new Rule("x", "", new Att([["key", "value"]]))],
  [
    'rule x [key("value\\n")]',
    new Rule("x", "", new Att([["key", "value\n"]])),
  ],
  [
    "rule [label]: x [key1, key2(value)]",
    new Rule(
      "x",
      "label",
      new Att([
        ["key1", ""],
        ["key2", "value"],
      ])
    ),
  ],
  [
    "rule [label]: X => Y [key1, key2(value)]",
    new Rule(
      "X => Y",
      "label",
      new Att([
        ["key1", ""],
        ["key2", "value"],
      ])
    ),
  ],
  ["claim x", new Claim("x")],
  ["configuration x", new Config("x")],
  ["context x", new Context("x")],
  ["context alias x", new Alias("x")],
  ['syntax lexical Digit = r"[0-9]"', new SyntaxLexical("Digit", "[0-9]")],
  ["syntax left foo", new SyntaxAssoc(Assoc.LEFT, ["foo"])],
  ["syntax right foo bar", new SyntaxAssoc(Assoc.RIGHT, ["foo", "bar"])],
  [
    "syntax non-assoc foo bar baz",
    new SyntaxAssoc(Assoc.NON_ASSOC, ["foo", "bar", "baz"]),
  ],
  ["syntax priority foo", new SyntaxPriority([["foo"]])],
  ["syntax priority foo bar", new SyntaxPriority([["foo", "bar"]])],
  ["syntax priority foo bar baz", new SyntaxPriority([["foo", "bar", "baz"]])],
  ["syntax priority foo > bar", new SyntaxPriority([["foo"], ["bar"]])],
  [
    "syntax priority foo > bar baz",
    new SyntaxPriority([["foo"], ["bar", "baz"]]),
  ],
  [
    "syntax priority foo > bar > baz",
    new SyntaxPriority([["foo"], ["bar"], ["baz"]]),
  ],
  [
    "syntax priority foo bar > baz",
    new SyntaxPriority([["foo", "bar"], ["baz"]]),
  ],
  ["syntax Foo", new SyntaxDecl(new SortDecl("Foo"))],
  ["syntax {Bar} Foo", new SyntaxDecl(new SortDecl("Foo", ["Bar"]))],
  [
    "syntax {Bar, Baz} Foo",
    new SyntaxDecl(new SortDecl("Foo", ["Bar", "Baz"])),
  ],
  ["syntax Foo{Bar}", new SyntaxDecl(new SortDecl("Foo", [], ["Bar"]))],
  [
    "syntax Foo{Bar, Baz}",
    new SyntaxDecl(new SortDecl("Foo", [], ["Bar", "Baz"])),
  ],
  [
    "syntax {Bar} Foo{Baz}",
    new SyntaxDecl(new SortDecl("Foo", ["Bar"], ["Baz"])),
  ],
  [
    "syntax Foo [bar]",
    new SyntaxDecl(new SortDecl("Foo"), new Att([["bar", ""]])),
  ],
  [
    "syntax Foo [bar, baz]",
    new SyntaxDecl(
      new SortDecl("Foo"),
      new Att([
        ["bar", ""],
        ["baz", ""],
      ])
    ),
  ],
  [
    "syntax {Bar, Baz} Foo [bar, baz]",
    new SyntaxDecl(
      new SortDecl("Foo", ["Bar", "Baz"]),
      new Att([
        ["bar", ""],
        ["baz", ""],
      ])
    ),
  ],
  ["syntax Foo = Bar", new SyntaxSynonym(new SortDecl("Foo"), new Sort("Bar"))],
  [
    "syntax {N} Vector{N} = Matrix{N, 1} [foo]",
    new SyntaxSynonym(
      new SortDecl("Vector", ["N"], ["N"]),
      new Sort("Matrix", ["N", 1]),
      new Att([["foo", ""]])
    ),
  ],
  [
    'syntax Foo ::= r"foo" [token]',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new Lexical("foo")], new Att([["token", ""]])),
      ]),
    ]),
  ],
  [
    'syntax FooBar ::= r"foo" "bar" [token]',
    new SyntaxDefn(new SortDecl("FooBar"), [
      new PriorityBlock([
        new Production(
          [new Lexical("foo"), new Terminal("bar")],
          new Att([["token", ""]])
        ),
      ]),
    ]),
  ],
  [
    'syntax Foos ::= List{Foo, ","}',
    new SyntaxDefn(new SortDecl("Foos"), [
      new PriorityBlock([new UserList("Foo", ",", false)]),
    ]),
  ],
  [
    'syntax Foos ::= NeList{Foo, ","}',
    new SyntaxDefn(new SortDecl("Foos"), [
      new PriorityBlock([new UserList("Foo", ",", true)]),
    ]),
  ],
  [
    'syntax Foo ::= "foo"',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([new Production([new Terminal("foo")])]),
    ]),
  ],
  [
    'syntax Foo ::= "foo" [symbol]',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new Terminal("foo")], new Att([["symbol", ""]])),
      ]),
    ]),
  ],
  [
    'syntax Foo ::= "foo" [symbol()]',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new Terminal("foo")], new Att([["symbol", ""]])),
      ]),
    ]),
  ],
  [
    'syntax Foo ::= "foo" [symbol("")]',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new Terminal("foo")], new Att([["symbol", ""]])),
      ]),
    ]),
  ],
  [
    'syntax Foo ::= "foo" [symbol(foo)]',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new Terminal("foo")], new Att([["symbol", "foo"]])),
      ]),
    ]),
  ],
  [
    'syntax Foo ::= "foo" [symbol("foo")]',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new Terminal("foo")], new Att([["symbol", "foo"]])),
      ]),
    ]),
  ],
  [
    "syntax Foo ::= Bar",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([new Production([new NonTerminal(new Sort("Bar"))])]),
    ]),
  ],
  [
    "syntax Foo ::= Bar [bar]",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production(
          [new NonTerminal(new Sort("Bar"))],
          new Att([["bar", ""]])
        ),
      ]),
    ]),
  ],
  [
    "syntax Foo ::= bar: Bar",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new NonTerminal(new Sort("Bar"), "bar")]),
      ]),
    ]),
  ],
  [
    "syntax Foo ::= left: bar: Bar",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock(
        [new Production([new NonTerminal(new Sort("Bar"), "bar")])],
        Assoc.LEFT
      ),
    ]),
  ],
  [
    "syntax Foo ::= Bar: Baz",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new NonTerminal(new Sort("Baz"), "Bar")]),
      ]),
    ]),
  ],
  [
    "syntax {N} Foo ::= Bar",
    new SyntaxDefn(new SortDecl("Foo", ["N"]), [
      new PriorityBlock([new Production([new NonTerminal(new Sort("Bar"))])]),
    ]),
  ],
  [
    "syntax {Baz} Foo{Baz} ::= Bar{1, Baz}",
    new SyntaxDefn(new SortDecl("Foo", ["Baz"], ["Baz"]), [
      new PriorityBlock([
        new Production([new NonTerminal(new Sort("Bar", [1, "Baz"]))]),
      ]),
    ]),
  ],
  [
    'syntax Foo ::= left: "foo"',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([new Production([new Terminal("foo")])], Assoc.LEFT),
    ]),
  ],
  [
    'syntax Foo ::= right: "foo"',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([new Production([new Terminal("foo")])], Assoc.RIGHT),
    ]),
  ],
  [
    'syntax Foo ::= non-assoc: "foo"',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock(
        [new Production([new Terminal("foo")])],
        Assoc.NON_ASSOC
      ),
    ]),
  ],
  [
    'syntax Foo ::= "bar" Bar',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new Terminal("bar"), new NonTerminal(new Sort("Bar"))]),
      ]),
    ]),
  ],
  [
    'syntax Foo ::= "bar" | Bar',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new Terminal("bar")]),
        new Production([new NonTerminal(new Sort("Bar"))]),
      ]),
    ]),
  ],
  [
    'syntax Foo ::= "bar" > "baz"',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([new Production([new Terminal("bar")])]),
      new PriorityBlock([new Production([new Terminal("baz")])]),
    ]),
  ],
  [
    'syntax Foo ::= "bar" Bar > "baz" Baz',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new Terminal("bar"), new NonTerminal(new Sort("Bar"))]),
      ]),
      new PriorityBlock([
        new Production([new Terminal("baz"), new NonTerminal(new Sort("Baz"))]),
      ]),
    ]),
  ],
  [
    'syntax Foo ::= "bar" | Bar > "baz" | Baz',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([new Terminal("bar")]),
        new Production([new NonTerminal(new Sort("Bar"))]),
      ]),
      new PriorityBlock([
        new Production([new Terminal("baz")]),
        new Production([new NonTerminal(new Sort("Baz"))]),
      ]),
    ]),
  ],
  [
    'syntax Foo ::= left: "bar" | Bar > right: "baz" | Baz',
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock(
        [
          new Production([new Terminal("bar")]),
          new Production([new NonTerminal(new Sort("Bar"))]),
        ],
        Assoc.LEFT
      ),
      new PriorityBlock(
        [
          new Production([new Terminal("baz")]),
          new Production([new NonTerminal(new Sort("Baz"))]),
        ],
        Assoc.RIGHT
      ),
    ]),
  ],
  [
    'syntax Foos ::= left: "bar" | Bar > right: r"baz" [token] > non-assoc: List{Foo, ","}',
    new SyntaxDefn(new SortDecl("Foos"), [
      new PriorityBlock(
        [
          new Production([new Terminal("bar")]),
          new Production([new NonTerminal(new Sort("Bar"))]),
        ],
        Assoc.LEFT
      ),
      new PriorityBlock(
        [new Production([new Lexical("baz")], new Att([["token", ""]]))],
        Assoc.RIGHT
      ),
      new PriorityBlock([new UserList("Foo", ",")], Assoc.NON_ASSOC),
    ]),
  ],
  [
    "syntax Foo ::= foo()",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([
          new Terminal("foo"),
          new Terminal("("),
          new Terminal(")"),
        ]),
      ]),
    ]),
  ],
  [
    "syntax Foo ::= foo() | bar()",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([
          new Terminal("foo"),
          new Terminal("("),
          new Terminal(")"),
        ]),
        new Production([
          new Terminal("bar"),
          new Terminal("("),
          new Terminal(")"),
        ]),
      ]),
    ]),
  ],
  [
    "syntax Foo ::= foo() | bar() | baz()",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([
          new Terminal("foo"),
          new Terminal("("),
          new Terminal(")"),
        ]),
        new Production([
          new Terminal("bar"),
          new Terminal("("),
          new Terminal(")"),
        ]),
        new Production([
          new Terminal("baz"),
          new Terminal("("),
          new Terminal(")"),
        ]),
      ]),
    ]),
  ],
  [
    "syntax Foo ::= foo(Bar)",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([
          new Terminal("foo"),
          new Terminal("("),
          new NonTerminal(new Sort("Bar")),
          new Terminal(")"),
        ]),
      ]),
    ]),
  ],
  [
    "syntax Foo ::= foo(bar: Bar)",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([
          new Terminal("foo"),
          new Terminal("("),
          new NonTerminal(new Sort("Bar"), "bar"),
          new Terminal(")"),
        ]),
      ]),
    ]),
  ],
  [
    "syntax Foo ::= foo(Bar, Baz)",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([
          new Terminal("foo"),
          new Terminal("("),
          new NonTerminal(new Sort("Bar")),
          new Terminal(","),
          new NonTerminal(new Sort("Baz")),
          new Terminal(")"),
        ]),
      ]),
    ]),
  ],
  [
    "syntax Foo ::= foo(bar: Bar, baz: Baz)",
    new SyntaxDefn(new SortDecl("Foo"), [
      new PriorityBlock([
        new Production([
          new Terminal("foo"),
          new Terminal("("),
          new NonTerminal(new Sort("Bar"), "bar"),
          new Terminal(","),
          new NonTerminal(new Sort("Baz"), "baz"),
          new Terminal(")"),
        ]),
      ]),
    ]),
  ],
  [
    "syntax List [hook(LIST.List)]",
    new SyntaxDecl(new SortDecl("List"), new Att([["hook", "LIST.List"]])),
  ],
  [
    "syntax List ::= List List",
    new SyntaxDefn(new SortDecl("List"), [
      new PriorityBlock([
        new Production([
          new NonTerminal(new Sort("List")),
          new NonTerminal(new Sort("List")),
        ]),
      ]),
    ]),
  ],
  [
    'syntax KItem ::= List "[" Int "]"',
    new SyntaxDefn(new SortDecl("KItem"), [
      new PriorityBlock([
        new Production([
          new NonTerminal(new Sort("List")),
          new Terminal("["),
          new NonTerminal(new Sort("Int")),
          new Terminal("]"),
        ]),
      ]),
    ]),
  ],
];

// Test data for import parsing
const IMPORT_TEST_DATA: Array<[string, AST]> = [
  ["imports TEST", new Import("TEST", true)],
  ["imports public TEST", new Import("TEST", true)],
  ["imports private TEST", new Import("TEST", false)],
];

// Test data for module parsing
const MODULE_TEST_DATA: Array<[string, AST]> = [
  [
    "module FOO endmodule",
    new Module("FOO", [], [], undefined, null, [1, 1, 1, 21]),
  ],
  [
    "module FOO [foo] endmodule",
    new Module("FOO", [], [], new Att([["foo", ""]]), null, [1, 1, 1, 27]),
  ],
  [
    "module FOO imports BAR endmodule",
    new Module("FOO", [], [new Import("BAR")], undefined, null, [1, 1, 1, 33]),
  ],
  [
    "module FOO imports BAR imports BAZ endmodule",
    new Module(
      "FOO",
      [],
      [new Import("BAR"), new Import("BAZ")],
      undefined,
      null,
      [1, 1, 1, 45]
    ),
  ],
  [
    "module FOO rule x endmodule",
    new Module("FOO", [new Rule("x")], [], undefined, null, [1, 1, 1, 28]),
  ],
  [
    "module FOO rule x rule y endmodule",
    new Module(
      "FOO",
      [new Rule("x"), new Rule("y")],
      [],
      undefined,
      null,
      [1, 1, 1, 35]
    ),
  ],
  [
    "module FOO [foo] imports BAR rule x endmodule",
    new Module(
      "FOO",
      [new Rule("x")],
      [new Import("BAR")],
      new Att([["foo", ""]]),
      null,
      [1, 1, 1, 46]
    ),
  ],
];

// Test data for definition parsing
const DEFINITION_TEST_DATA: Array<[string, AST]> = [
  ["", new Definition()],
  ['requires "foo.k"', new Definition([], [new Require("foo.k")])],
  [
    'requires "foo.k" requires "bar.k"',
    new Definition([], [new Require("foo.k"), new Require("bar.k")]),
  ],
  [
    "module FOO endmodule",
    new Definition([new Module("FOO", [], [], undefined, null, [1, 1, 1, 21])]),
  ],
  [
    "module FOO endmodule module BAR endmodule",
    new Definition([
      new Module("FOO", [], [], undefined, null, [1, 1, 1, 21]),
      new Module("BAR", [], [], undefined, null, [1, 22, 1, 42]),
    ]),
  ],
  [
    'requires "foo.k" module FOO endmodule',
    new Definition(
      [new Module("FOO", [], [], undefined, null, [1, 18, 1, 38])],
      [new Require("foo.k")]
    ),
  ],
];

describe("OuterParser sentence parsing", () => {
  SENTENCE_TEST_DATA.forEach(([kText, expected], index) => {
    test(`sentence test ${index + 1}: ${kText}`, () => {
      const parser = new OuterParser(kText);
      const actual = parser.sentence();
      expect(actual).toEqual(expected);
    });
  });
});

describe("OuterParser import parsing", () => {
  IMPORT_TEST_DATA.forEach(([kText, expected], index) => {
    test(`import test ${index + 1}: ${kText}`, () => {
      const parser = new OuterParser(kText);
      const actual = parser.import();
      expect(actual).toEqual(expected as any);
    });
  });
});

describe("OuterParser module parsing", () => {
  MODULE_TEST_DATA.forEach(([kText, expected], index) => {
    test(`module test ${index + 1}: ${kText}`, () => {
      const parser = new OuterParser(kText);
      const actual = parser.module();
      expect(actual).toEqual(expected as any);
    });
  });
});

describe("OuterParser require parsing", () => {
  test("require test", () => {
    const kText = 'requires "foo.k"';
    const parser = new OuterParser(kText);
    const expected = new Require("foo.k");
    const actual = parser.require();
    expect(actual).toEqual(expected);
  });
});

describe("OuterParser definition parsing", () => {
  DEFINITION_TEST_DATA.forEach(([kText, expected], index) => {
    test(`definition test ${index + 1}: ${kText}`, () => {
      const parser = new OuterParser(kText);
      const actual = parser.definition();
      expect(actual).toEqual(expected as any);
    });
  });
});
