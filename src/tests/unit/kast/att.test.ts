import { describe, expect, test } from "bun:test";
import type { AttEntry } from "../../../kast/att";
import { Atts, KAtt } from "../../../kast/att";

const PRETTY_TEST_DATA: Array<[string, AttEntry[], string]> = [
  ["empty", [], ""],
  ["nullary", [Atts.FUNCTION.call(null)], "[function]"],
  [
    "two-nullaries",
    [Atts.FUNCTION.call(null), Atts.TOTAL.call(null)],
    "[function, total]",
  ],
  ["opt-none", [Atts.CONCRETE.call(null)], "[concrete]"],
  ["opt-some-empty-str", [Atts.CONCRETE.call("")], '[concrete("")]'],
  ["opt-some-nonempty-str", [Atts.CONCRETE.call("foo")], '[concrete("foo")]'],
  [
    "multiple",
    [Atts.SYMBOL.call("foo"), Atts.FUNCTION.call(null), Atts.TOTAL.call(null)],
    '[symbol("foo"), function, total]',
  ],
];

describe("KAtt", () => {
  PRETTY_TEST_DATA.forEach(([testId, entries, expected]) => {
    test(`pretty: ${testId}`, () => {
      // Given
      const att = new KAtt(entries);

      // When
      const actual = att.pretty;

      // Then
      expect(actual).toBe(expected);
    });
  });
});
