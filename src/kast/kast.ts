import { hashStr } from "../utils";

export abstract class KAst {
  private _hash: string | null = null;

  public static version(): number {
    return 3;
  }

  public abstract toDict(): Record<string, any>;

  public toJson(): string {
    const dictObj = this.toDict();
    return JSON.stringify(dictObj);
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
    const propertyDict: Record<string, any> = {};
    const keys = Object.keys(this).sort();

    for (const key of keys) {
      propertyDict[key] = (this as any)[key];
    }

    return Object.values(propertyDict);
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

export function kastTerm(dct: Record<string, any>): Record<string, any> {
  if (dct["format"] !== "KAST") {
    throw new Error(`Invalid format: ${dct["format"]}`);
  }

  if (dct["version"] != KAst.version()) {
    throw new Error(
      `Invalid version: ${dct["version"]}, expected: ${KAst.version()}`
    );
  }

  return dct["term"];
}
