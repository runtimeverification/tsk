import { KApply, KInner, KSort, KToken } from "../inner";

export const INT = new KSort("Int");

/**
 * Instantiate the KAST term `#token(i, "Int")`.
 *
 * @param i - The integer literal.
 * @returns The KAST term `#token(i, "Int")`.
 */
export function intToken(i: number): KToken {
  return new KToken(String(i), INT);
}

/**
 * Instantiate the KAST term `_<Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_<Int_(i1, i2)`.
 */
export function ltInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_<Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_<=Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_<=Int_(i1, i2)`.
 */
export function leInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_<=Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_>Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_>Int_(i1, i2)`.
 */
export function gtInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_>Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_>=Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_>=Int_(i1, i2)`.
 */
export function geInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_>=Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_==Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_==Int_(i1, i2)`.
 */
export function eqInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_==Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_=/=Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_=/=Int_(i1, i2)`.
 */
export function neqInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_=/=Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `~Int_(i)`.
 *
 * @param i - The integer operand.
 * @returns The KAST term `~Int_(i)`.
 */
export function notInt(i: KInner): KApply {
  return new KApply("~Int_", [i]);
}

/**
 * Instantiate the KAST term `_^Int_(i1, i2)`.
 *
 * @param i1 - The base.
 * @param i2 - The exponent.
 * @returns The KAST term `_^Int_(i1, i2)`.
 */
export function expInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_^Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_^%Int__(i1, i2, i3)`.
 *
 * @param i1 - The dividend.
 * @param i2 - The divisor.
 * @param i3 - The modulus.
 * @returns The KAST term `_^%Int__(i1, i2, i3)`.
 */
export function expModInt(i1: KInner, i2: KInner, i3: KInner): KApply {
  return new KApply("_^%Int__", [i1, i2, i3]);
}

/**
 * Instantiate the KAST term `_*Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_*Int_(i1, i2)`.
 */
export function mulInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_*Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_/Int_(i1, i2)`.
 *
 * @param i1 - The dividend.
 * @param i2 - The divisor.
 * @returns The KAST term `_/Int_(i1, i2)`.
 */
export function divInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_/Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_%Int_(i1, i2)`.
 *
 * @param i1 - The dividend.
 * @param i2 - The divisor.
 * @returns The KAST term `_%Int_(i1, i2)`.
 */
export function modInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_%Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_divInt_(i1, i2)`.
 *
 * @param i1 - The dividend.
 * @param i2 - The divisor.
 * @returns The KAST term `_divInt_(i1, i2)`.
 */
export function euclidDivInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_divInt_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_modInt_(i1, i2)`.
 *
 * @param i1 - The dividend.
 * @param i2 - The divisor.
 * @returns The KAST term `_modInt_(i1, i2)`.
 */
export function euclidModInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_modInt_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_+Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_+Int_(i1, i2)`.
 */
export function addInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_+Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_-Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_-Int_(i1, i2)`.
 */
export function subInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_-Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_>>Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_>>Int_(i1, i2)`.
 */
export function rshiftInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_>>Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_<<Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_<<Int_(i1, i2)`.
 */
export function lshiftInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_<<Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_&Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_&Int_(i1, i2)`.
 */
export function andInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_&Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_xorInt_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_xorInt_(i1, i2)`.
 */
export function xorInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_xorInt_", [i1, i2]);
}

/**
 * Instantiate the KAST term `_|Int_(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `_|Int_(i1, i2)`.
 */
export function orInt(i1: KInner, i2: KInner): KApply {
  return new KApply("_|Int_", [i1, i2]);
}

/**
 * Instantiate the KAST term `minInt(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `minInt(i1, i2)`.
 */
export function minInt(i1: KInner, i2: KInner): KApply {
  return new KApply("minInt", [i1, i2]);
}

/**
 * Instantiate the KAST term `maxInt(i1, i2)`.
 *
 * @param i1 - The left operand.
 * @param i2 - The right operand.
 * @returns The KAST term `maxInt(i1, i2)`.
 */
export function maxInt(i1: KInner, i2: KInner): KApply {
  return new KApply("maxInt", [i1, i2]);
}

/**
 * Instantiate the KAST term `absInt(i)`.
 *
 * @param i - The integer operand.
 * @returns The KAST term `absInt(i)`.
 */
export function absInt(i: KInner): KApply {
  return new KApply("absInt", [i]);
}
