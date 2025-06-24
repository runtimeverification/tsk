import { hashStr, mapToObject } from "../utils";

export abstract class KAst {
  private _hash: string | null = null;

  public static version(): number {
    return 3;
  }

  public abstract toDict(): Map<string, any>;

  public toJson(): string {
    const dictMap = this.toDict();
    const obj = mapToObject(dictMap);
    return JSON.stringify(obj);
  }

  public toString(): string {
    return JSON.stringify(this.toJson());
  }

  public equals(other: KAst): boolean {
    // Simple structural equality check using JSON serialization
    return JSON.stringify(this.toJson()) === JSON.stringify(other.toJson());
  }

  public get hash(): string {
    if (this._hash === null) {
      this._hash = hashStr(this.toJson());
    }
    return this._hash;
  }

  // TypeScript doesn't have automatic comparison like Python's dataclass
  // This is a simplified version for basic comparison
  protected asShallowTuple(): any[] {
    // Get all enumerable properties in a consistent order
    const propertyMap = new Map<string, any>();
    const keys = Object.keys(this).sort();

    for (const key of keys) {
      propertyMap.set(key, (this as any)[key]);
    }

    return Array.from(propertyMap.values());
  }

  // Implement comparison operators for sorting
  public lessThan(other: any): boolean {
    if (!(other instanceof KAst)) {
      throw new Error("Cannot compare KAst with non-KAst object");
    }

    if (this.constructor === other.constructor) {
      const thisTuple = this.asShallowTuple();
      const otherTuple = other.asShallowTuple();

      // Lexicographic comparison
      for (let i = 0; i < Math.min(thisTuple.length, otherTuple.length); i++) {
        if (thisTuple[i] < otherTuple[i]) return true;
        if (thisTuple[i] > otherTuple[i]) return false;
      }
      return thisTuple.length < otherTuple.length;
    }

    return this.constructor.name < other.constructor.name;
  }
}

export function kastTerm(dct: Map<string, any>): Map<string, any> {
  if (dct.get("format") !== "KAST") {
    throw new Error(`Invalid format: ${dct.get("format")}`);
  }

  if (dct.get("version") != KAst.version()) {
    throw new Error(
      `Invalid version: ${dct.get("version")}, expected: ${KAst.version()}`
    );
  }

  return dct.get("term");
}
