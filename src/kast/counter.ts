/**
 * TypeScript implementation of Python's collections.Counter
 * A Counter is a dict subclass for counting hashable objects.
 */
export class Counter<T = string> extends Map<T, number> {
  constructor(
    iterable?: Iterable<T> | Record<string, number> | Map<T, number>
  ) {
    super();

    if (iterable) {
      if (iterable instanceof Map) {
        // Handle Map input
        for (const [key, value] of iterable) {
          this.set(key, value);
        }
      } else if (
        typeof iterable === "object" &&
        !(Symbol.iterator in iterable)
      ) {
        // Handle plain object input
        const obj = iterable as Record<string, number>;
        for (const [key, value] of Object.entries(obj)) {
          this.set(key as T, value);
        }
      } else {
        // Handle iterable input
        for (const item of iterable as Iterable<T>) {
          this.increment(item);
        }
      }
    }
  }

  /**
   * Add an item to the counter, incrementing its count by 1
   */
  increment(key: T, count: number = 1): void {
    this.set(key, this.get(key, 0) + count);
  }

  /**
   * Subtract an item from the counter, decrementing its count by 1
   */
  decrement(key: T, count: number = 1): void {
    const currentCount = this.get(key, 0);
    const newCount = currentCount - count;
    if (newCount <= 0) {
      this.delete(key);
    } else {
      this.set(key, newCount);
    }
  }

  /**
   * Get the count for a key, returning defaultValue if not found
   */
  get(key: T, defaultValue: number = 0): number {
    return super.get(key) ?? defaultValue;
  }

  /**
   * Update the counter with counts from another counter or iterable
   */
  update(
    other: Iterable<T> | Counter<T> | Record<string, number> | Map<T, number>
  ): void {
    if (other instanceof Counter || other instanceof Map) {
      for (const [key, count] of other) {
        this.increment(key, count);
      }
    } else if (typeof other === "object" && !(Symbol.iterator in other)) {
      const obj = other as Record<string, number>;
      for (const [key, count] of Object.entries(obj)) {
        this.increment(key as T, count);
      }
    } else {
      for (const item of other as Iterable<T>) {
        this.increment(item);
      }
    }
  }

  /**
   * Subtract counts from another counter or iterable
   */
  subtract(
    other: Iterable<T> | Counter<T> | Record<string, number> | Map<T, number>
  ): void {
    if (other instanceof Counter || other instanceof Map) {
      for (const [key, count] of other) {
        this.decrement(key, count);
      }
    } else if (typeof other === "object" && !(Symbol.iterator in other)) {
      const obj = other as Record<string, number>;
      for (const [key, count] of Object.entries(obj)) {
        this.decrement(key as T, count);
      }
    } else {
      for (const item of other as Iterable<T>) {
        this.decrement(item);
      }
    }
  }

  /**
   * Return the n most common elements and their counts from the most common to the least
   */
  mostCommon(n?: number): Array<[T, number]> {
    const entries = Array.from(this.entries()).sort((a, b) => b[1] - a[1]);
    return n !== undefined ? entries.slice(0, n) : entries;
  }

  /**
   * Return the n least common elements and their counts from the least common to the most
   */
  leastCommon(n?: number): Array<[T, number]> {
    const entries = Array.from(this.entries()).sort((a, b) => a[1] - b[1]);
    return n !== undefined ? entries.slice(0, n) : entries;
  }

  /**
   * Return all elements with positive counts
   */
  elements(): T[] {
    const result: T[] = [];
    for (const [key, count] of this) {
      for (let i = 0; i < count; i++) {
        result.push(key);
      }
    }
    return result;
  }

  /**
   * Return the total of all counts
   */
  total(): number {
    let sum = 0;
    for (const count of this.values()) {
      sum += count;
    }
    return sum;
  }

  /**
   * Addition: add counts from two counters
   */
  add(other: Counter<T>): Counter<T> {
    const result = new Counter<T>(this);
    result.update(other);
    return result;
  }

  /**
   * Subtraction: subtract counts (keeping only positive counts)
   */
  sub(other: Counter<T>): Counter<T> {
    const result = new Counter<T>(this);
    result.subtract(other);
    return result;
  }

  /**
   * Intersection: min(c[x], d[x])
   */
  intersection(other: Counter<T>): Counter<T> {
    const result = new Counter<T>();
    for (const [key, count] of this) {
      const otherCount = other.get(key, 0);
      if (otherCount > 0) {
        result.set(key, Math.min(count, otherCount));
      }
    }
    return result;
  }

  /**
   * Union: max(c[x], d[x])
   */
  union(other: Counter<T>): Counter<T> {
    const result = new Counter<T>(this);
    for (const [key, count] of other) {
      const currentCount = result.get(key, 0);
      result.set(key, Math.max(currentCount, count));
    }
    return result;
  }

  /**
   * Create a new Counter with only positive counts
   */
  positive(): Counter<T> {
    const result = new Counter<T>();
    for (const [key, count] of this) {
      if (count > 0) {
        result.set(key, count);
      }
    }
    return result;
  }

  /**
   * Convert to a plain object
   */
  toObject(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, count] of this) {
      result[String(key)] = count;
    }
    return result;
  }

  /**
   * Convert to a string representation
   */
  toString(): string {
    const entries = Array.from(this.entries())
      .map(([key, count]) => `${String(key)}: ${count}`)
      .join(", ");
    return `Counter({${entries}})`;
  }

  /**
   * Create a Counter from keys with a default count
   */
  static fromKeys<T>(keys: Iterable<T>, count: number = 1): Counter<T> {
    const result = new Counter<T>();
    for (const key of keys) {
      result.set(key, count);
    }
    return result;
  }
}

// Operator overloading functions for convenience
export function add<T>(a: Counter<T>, b: Counter<T>): Counter<T> {
  return a.add(b);
}

export function subtract<T>(a: Counter<T>, b: Counter<T>): Counter<T> {
  return a.sub(b);
}

export function intersection<T>(a: Counter<T>, b: Counter<T>): Counter<T> {
  return a.intersection(b);
}

export function union<T>(a: Counter<T>, b: Counter<T>): Counter<T> {
  return a.union(b);
}
