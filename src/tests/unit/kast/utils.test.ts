import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { KDefinition } from "../../../kast/outer";
import { parseOuter } from "../../../kast/utils";
import { objectToMap } from "../../../utils";

const TEST_DATA_DIR = path.resolve(__dirname, "../test-data");
const PARSE_OUTER_TEST_DIR = path.join(TEST_DATA_DIR, "parse-outer");

// Get all .k and .md files in the parse-outer test directory
const PARSE_OUTER_TEST_FILES = [
  ...fs
    .readdirSync(PARSE_OUTER_TEST_DIR)
    .filter((file) => file.endsWith(".k") || file.endsWith(".md"))
    .map((file) => path.join(PARSE_OUTER_TEST_DIR, file)),
];

describe("parseOuter", () => {
  PARSE_OUTER_TEST_FILES.forEach((testFile, index) => {
    test(`parseOuter: ${path.basename(testFile)}`, () => {
      // Given
      const expectedFile = testFile + ".expected.json";
      const expectedJson = JSON.parse(fs.readFileSync(expectedFile, "utf8"));
      const expectedMap = objectToMap(expectedJson);
      const expected = KDefinition.fromDict(expectedMap);
      const mainModule = path.parse(testFile).name.toUpperCase();

      // When
      const actual = parseOuter(testFile, mainModule, {
        includeDirs: [path.join(path.dirname(testFile), "include")],
        includeSource: false,
      });

      // Then - compare without location attributes since they differ in format
      expect(actual).toEqual(expected);
    });
  });
});
