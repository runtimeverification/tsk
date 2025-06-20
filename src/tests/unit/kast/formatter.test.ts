import { describe, expect, test } from "bun:test";
import { Atts, Format, KAtt } from "../../../kast/att";
import { Formatter } from "../../../kast/formatter";
import { KApply, KLabel, KSort, KVariable } from "../../../kast/inner";
import {
  KDefinition,
  KFlatModule,
  KNonTerminal,
  KProduction,
  KTerminal,
} from "../../../kast/outer";
import { INT } from "../../../kast/prelude/kint";
import { token } from "../../../kast/prelude/utils";

// Constants
const add = new KLabel("_+_");
const sub = new KLabel("_-_");
const cell = new KLabel("<cell>");

function production(
  klabel: KLabel,
  sort: KSort,
  items: (KSort | string)[],
  format: string
): KProduction {
  const _items = items.map((item) =>
    item instanceof KSort ? new KNonTerminal(item) : new KTerminal(item)
  );
  return new KProduction(
    sort,
    _items,
    [],
    klabel,
    new KAtt([Atts.FORMAT.call(Format.parse(format))])
  );
}

const S = new KSort("S");
const DEFINITION = new KDefinition("TEST", [
  new KFlatModule("TEST", [
    production(cell, INT, ["<cell>", INT, "</cell>"], "%1%i%n%2%d%n%3"),
    production(add, INT, [INT, "+", INT], "%1 %2 %3"),
    production(sub, INT, [INT, "-", INT], "%1% %-% %3"),
  ]),
]);

const TEST_DATA: Array<[any, string]> = [
  [token(1), "1"],
  [new KVariable("X"), "X"],
  [new KVariable("X", INT), "X:Int"],
  [new KApply(add, [token(1), token(2)]), "1 + 2"],
  [new KApply(sub, [token(1), token(2)]), "1 - 2"],
  [
    new KApply(add, [new KApply(add, [token(1), token(2)]), token(3)]),
    "1 + 2 + 3",
  ],
  [
    new KApply(cell, [token(1)]),
    `<cell>
  1
</cell>`,
  ],
  [
    new KApply(cell, [new KApply(cell, [token(1)])]),
    `<cell>
  <cell>
    1
  </cell>
</cell>`,
  ],
];

describe("Formatter", () => {
  TEST_DATA.forEach(([term, output], index) => {
    test(`test case ${index}`, () => {
      // Given
      const expected = output.trim();
      const formatter = new Formatter(DEFINITION);

      // When
      const actual = formatter.format(term);

      // Then
      expect(actual).toBe(expected);
    });
  });
});
