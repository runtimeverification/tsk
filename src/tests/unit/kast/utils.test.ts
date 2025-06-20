import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { KDefinition } from "../../../kast/outer";
import { parseOuter } from "../../../kast/utils";

const TEST_DATA_DIR = path.resolve(__dirname, "../test-data");
const PARSE_OUTER_TEST_DIR = path.join(TEST_DATA_DIR, "parse-outer");

// Get all .k and .md files in the parse-outer test directory
const PARSE_OUTER_TEST_FILES = [
  ...fs
    .readdirSync(PARSE_OUTER_TEST_DIR)
    .filter((file) => file.endsWith(".k") || file.endsWith(".md"))
    .map((file) => path.join(PARSE_OUTER_TEST_DIR, file)),
];

/**
 * Recursively convert a plain JavaScript object to a Map structure
 * This is needed because JSON.parse() returns plain objects but KDefinition.fromDict() expects Maps
 */
function objectToMap(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(objectToMap);
  }

  if (typeof obj === "object" && obj.constructor === Object) {
    const map = new Map<string, any>();
    for (const [key, value] of Object.entries(obj)) {
      map.set(key, objectToMap(value));
    }
    return map;
  }

  return obj;
}

/**
 * Remove location attributes for comparison since they differ in format between Python and TypeScript
 * The TypeScript version uses structured {start: {line, col}, end: {line, col}} while Python uses [line, col, line, col]
 */
function removeLocationAttrs(obj: any): any {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeLocationAttrs);
  }

  // Handle KAtt objects that have atts property
  if (obj.atts && obj.atts._dict) {
    const newAtts = new Map();
    for (const [key, value] of obj.atts._dict.entries()) {
      if (key.name !== "org.kframework.attributes.Location") {
        newAtts.set(key, removeLocationAttrs(value));
      }
    }
    return {
      ...obj,
      atts: {
        ...obj.atts,
        _dict: newAtts,
      },
    };
  }

  // Handle plain objects and other structures
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "allModules" || key === "modules") {
      result[key] = (value as any[]).map(removeLocationAttrs);
    } else if (key === "mainModule") {
      result[key] = removeLocationAttrs(value);
    } else if (key === "att") {
      result[key] = removeLocationAttrs(value);
    } else {
      result[key] = removeLocationAttrs(value);
    }
  }

  return result;
}

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
      const actualWithoutLocs = removeLocationAttrs(actual);
      const expectedWithoutLocs = removeLocationAttrs(expected);
      expect(actualWithoutLocs).toEqual(expectedWithoutLocs);
    });
  });
});
