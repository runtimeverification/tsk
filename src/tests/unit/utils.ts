import { resolve } from "path";
import { KApply, KLabel, KVariable } from "../../kast/inner";
import { geInt, intToken, ltInt } from "../../kast/prelude/kint";
import { mlEqualsTrue } from "../../kast/prelude/ml";

export const TEST_DATA_DIR = resolve(__dirname, "test-data");

// Basic test data constants
export const a = new KApply("a", []);
export const b = new KApply("b", []);
export const c = new KApply("c", []);

export const x = new KVariable("x");
export const y = new KVariable("y");
export const z = new KVariable("z");

// Helper functions for creating KApply instances
export function f(...args: any[]) {
  return new KApply("f", args);
}

export function g(...args: any[]) {
  return new KApply("g", args);
}

export function h(...args: any[]) {
  return new KApply("h", args);
}

// KLabel constants for direct use
export const fLabel = new KLabel("f");
export const gLabel = new KLabel("g");
export const hLabel = new KLabel("h");
export const k = new KLabel("<k>");

/**
 * Create a ML equals true constraint for less than comparison
 * @param varName - Variable name
 * @param n - Integer value to compare against
 * @returns KApply representing mlEqualsTrue(ltInt(var, n))
 */
export function lt_ml(varName: string, n: number): KApply {
  return mlEqualsTrue(ltInt(new KVariable(varName), intToken(n)));
}

/**
 * Create a ML equals true constraint for greater than or equal comparison
 * @param varName - Variable name
 * @param n - Integer value to compare against
 * @returns KApply representing mlEqualsTrue(geInt(var, n))
 */
export function ge_ml(varName: string, n: number): KApply {
  return mlEqualsTrue(geInt(new KVariable(varName), intToken(n)));
}
