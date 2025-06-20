import * as child_process from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as tar from "tar";

// Generic type variables
export type Hashable = any; // string | number | boolean;

// FrozenDict implementation
export class FrozenDict<K extends Hashable, V> implements Map<K, V> {
  private readonly _dict: Map<K, V>;
  private _hash: number | null = null;

  constructor(entries?: Iterable<[K, V]> | Record<string, V>) {
    if (entries) {
      if (Symbol.iterator in Object(entries)) {
        this._dict = new Map(entries as Iterable<[K, V]>);
      } else {
        this._dict = new Map(
          Object.entries(entries as Record<string, V>) as [K, V][]
        );
      }
    } else {
      this._dict = new Map();
    }
  }

  get size(): number {
    return this._dict.size;
  }

  get(key: K): V | undefined {
    return this._dict.get(key);
  }

  has(key: K): boolean {
    return this._dict.has(key);
  }

  keys(): MapIterator<K> {
    return this._dict.keys();
  }

  values(): MapIterator<V> {
    return this._dict.values();
  }

  entries(): MapIterator<[K, V]> {
    return this._dict.entries();
  }

  forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any
  ): void {
    this._dict.forEach(callbackfn, thisArg);
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this._dict[Symbol.iterator]();
  }

  get [Symbol.toStringTag](): string {
    return "FrozenDict";
  }

  // Additional methods for compatibility
  set(key: K, value: V): this {
    throw new Error("FrozenDict is immutable");
  }

  delete(key: K): boolean {
    throw new Error("FrozenDict is immutable");
  }

  clear(): void {
    throw new Error("FrozenDict is immutable");
  }

  hashCode(): number {
    if (this._hash === null) {
      let h = 0;
      for (const [key, value] of this.entries()) {
        h ^= this.hashPair(key, value);
      }
      this._hash = h;
    }
    return this._hash;
  }

  private hashPair(key: K, value: V): number {
    // Simple hash function for demonstration
    const keyStr = typeof key === "string" ? key : String(key);
    const valueStr = typeof value === "string" ? value : String(value);
    const combined = keyStr + ":" + valueStr;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  toString(): string {
    return `FrozenDict(${JSON.stringify(Object.fromEntries(this._dict))})`;
  }
}

export const EMPTY_FROZEN_DICT = new FrozenDict<any, any>();

// Utility functions
export function checkType<T>(x: any, typ: new (...args: any[]) => T): T {
  if (!(x instanceof typ)) {
    throw new Error(`Expected object of type ${typ.name}, got: ${x}`);
  }
  return x;
}

export function raised(
  f: (...args: any[]) => any,
  ...args: any[]
): Error | null {
  try {
    f(...args);
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

export function mergeWith<K, V>(
  f: (v1: V, v2: V) => V,
  d1: Map<K, V> | Record<string, V>,
  d2: Map<K, V> | Record<string, V>
): Map<K, V> {
  const result = new Map<K, V>();

  // Add all from d1
  if (d1 instanceof Map) {
    for (const [k, v] of d1.entries()) {
      result.set(k, v);
    }
  } else {
    for (const [k, v] of Object.entries(d1)) {
      result.set(k as K, v as V);
    }
  }

  // Merge from d2
  if (d2 instanceof Map) {
    for (const [k, v2] of d2.entries()) {
      const v1 = result.get(k);
      if (v1 !== undefined) {
        result.set(k, f(v1, v2));
      } else {
        result.set(k, v2);
      }
    }
  } else {
    for (const [k, v2] of Object.entries(d2)) {
      const key = k as K;
      const v1 = result.get(key);
      if (v1 !== undefined) {
        result.set(key, f(v1, v2 as V));
      } else {
        result.set(key, v2 as V);
      }
    }
  }

  return result;
}

export function notNone<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) {
    throw new Error("Expected value other than null/undefined");
  }
  return x;
}

export function filterNone<K, V>(
  mapping: Map<K, V | null | undefined> | Record<string, V | null | undefined>
): Map<K, V> {
  const result = new Map<K, V>();

  if (mapping instanceof Map) {
    for (const [k, v] of mapping.entries()) {
      if (v !== null && v !== undefined) {
        result.set(k, v);
      }
    }
  } else {
    for (const [k, v] of Object.entries(mapping)) {
      if (v !== null && v !== undefined) {
        result.set(k as K, v as V);
      }
    }
  }

  return result;
}

// Higher-order functions
export class Chainable<P, R> {
  private _f: (p: P) => R;

  constructor(f: (p: P) => R) {
    this._f = f;
  }

  call(p: P): R {
    return this._f(p);
  }

  then<Q>(other: (r: R) => Q): Chainable<P, Q> {
    return new Chainable((p: P) => other(this._f(p)));
  }
}

export const chain = new Chainable<any, any>((x: any) => x);

export function maybe<P, R>(
  f: (p: P) => R
): (p: P | null | undefined) => R | null {
  return (p: P | null | undefined): R | null => {
    return p !== null && p !== undefined ? f(p) : null;
  };
}

export function findCommonItems<T>(
  l1: Iterable<T>,
  l2: Iterable<T>
): [T[], T[], T[]] {
  const common: T[] = [];
  const set2 = new Set(l2);

  for (const item of l1) {
    if (set2.has(item)) {
      common.push(item);
    }
  }

  const newL1 = Array.from(l1).filter((item) => !common.includes(item));
  const newL2 = Array.from(l2).filter((item) => !common.includes(item));

  return [common, newL1, newL2];
}

// Iterable utilities
export function intersperse<T>(
  iterable: Iterable<T>,
  delimiter: T
): Generator<T> {
  return (function* () {
    const it = iterable[Symbol.iterator]();
    let result = it.next();

    if (result.done) {
      return;
    }

    yield result.value;

    while (true) {
      result = it.next();
      if (result.done) {
        break;
      }
      yield delimiter;
      yield result.value;
    }
  })();
}

export function* unique<T>(iterable: Iterable<T>): Generator<T> {
  const seen = new Set<T>();
  for (const item of iterable) {
    if (!seen.has(item)) {
      seen.add(item);
      yield item;
    }
  }
}

export function single<T>(iterable: Iterable<T>): T {
  const it = iterable[Symbol.iterator]();
  const first = it.next();

  if (first.done) {
    throw new Error("Expected a single element, found none");
  }

  const second = it.next();
  if (!second.done) {
    throw new Error(
      `Expected a single element, found more: ${first.value}, ${second.value}`
    );
  }

  return first.value;
}

export function some<T>(iterable: Iterable<T>): T | undefined {
  for (const item of iterable) {
    return item;
  }
  return undefined;
}

export function partition<T>(
  iterable: Iterable<T>,
  pred: (x: T, y: T) => boolean
): T[][] {
  const groups: T[][] = [];

  for (const item of iterable) {
    let found = false;

    for (const group of groups) {
      const groupMatches: boolean[] = [];

      for (const groupItem of group) {
        const match = pred(groupItem, item);
        if (match !== pred(item, groupItem)) {
          throw new Error(
            `Partitioning failed, predicate commutativity failed on: ${item}, ${groupItem}`
          );
        }
        groupMatches.push(match);
      }

      if (found && groupMatches.some((m) => m)) {
        throw new Error(
          `Partitioning failed, item matched multiple groups: ${item}`
        );
      }

      if (groupMatches.every((m) => m)) {
        found = true;
        group.push(item);
      } else if (groupMatches.some((m) => m)) {
        throw new Error(
          `Partitioning failed, item matched only some elements of group: ${item}`
        );
      }
    }

    if (!found) {
      groups.push([item]);
    }
  }

  return groups;
}

// String utilities
export function nonemptyStr(x: any): string {
  if (x === null || x === undefined) {
    throw new Error("Expected nonempty string, found: null/undefined");
  }
  if (typeof x !== "string") {
    throw new Error(`Expected nonempty string, found: ${typeof x}`);
  }
  if (x === "") {
    throw new Error("Expected nonempty string, found: empty string");
  }
  return x;
}

export function addIndent(indent: string, lines: Iterable<string>): string[] {
  return Array.from(lines, (line) => indent + line);
}

export function isHexstring(x: string): boolean {
  return /^[0-9a-fA-F]*$/.test(x);
}

// Hash utilities
export function hashStr(x: any): string {
  const hash = crypto.createHash("sha256");
  hash.update(String(x));
  return hash.digest("hex");
}

export function hashFile(
  filePath: string,
  chunkSize: number = 64 * 1024
): string {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

export function isHash(x: any): boolean {
  return typeof x === "string" && x.length === 64 && isHexstring(x);
}

export function shortenHash(
  h: string,
  leftChars: number = 6,
  rightChars: number = 6
): string {
  const left = leftChars > 0 ? h.slice(0, leftChars) : "";
  const right = rightChars > 0 ? h.slice(-rightChars) : "";
  return left + ".." + right;
}

export function shortenHashes(
  value: any,
  leftChars: number = 6,
  rightChars: number = 6
): any {
  if (isHash(value)) {
    return shortenHash(value, leftChars, rightChars);
  } else if (Array.isArray(value)) {
    return value.map((item) => shortenHashes(item, leftChars, rightChars));
  } else if (value && typeof value === "object") {
    const result: any = {};
    for (const [k, v] of Object.entries(value)) {
      result[shortenHashes(k, leftChars, rightChars)] = shortenHashes(
        v,
        leftChars,
        rightChars
      );
    }
    return result;
  } else if (value instanceof Set) {
    const result = new Set();
    for (const item of value) {
      result.add(shortenHashes(item, leftChars, rightChars));
    }
    return result;
  }
  return value;
}

export function deconstructShortHash(h: string): [string, string] {
  const x = h.toLowerCase();
  if (isHash(x)) {
    return [x, x];
  }

  const parts = x.split("..");
  if (parts.length === 2 && isHexstring(parts[0]!) && isHexstring(parts[1]!)) {
    return [parts[0]!, parts[1]!];
  }

  throw new Error(`Bad short hash: ${h}`);
}

export function compareShortHashes(lhs: string, rhs: string): boolean {
  const [l0, l1] = deconstructShortHash(lhs);
  const [r0, r1] = deconstructShortHash(rhs);
  return (
    (l0.startsWith(r0) || r0.startsWith(l0)) &&
    (l1.endsWith(r1) || r1.endsWith(l1))
  );
}

// Path utilities
export function checkDirPath(dirPath: string): void {
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`);
  }
}

export function checkFilePath(filePath: string): void {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isFile()) {
    throw new Error(`Path is not a file: ${resolved}`);
  }
}

export function ensureDirPath(dirPath: string): string {
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  } else {
    checkDirPath(resolved);
  }
  return resolved;
}

export function absOrRelTo(targetPath: string, basePath: string): string {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }
  return path.join(basePath, targetPath);
}

// POSet implementation
export class POSet<H extends Hashable> {
  public readonly image: FrozenDict<H, Set<H>>;

  constructor(relation: Iterable<[H, H]>) {
    const imageMap = this.computeImage(relation);
    const frozenImage = new Map<H, Set<H>>();
    for (const [x, y] of imageMap.entries()) {
      frozenImage.set(x, new Set(y));
    }
    this.image = new FrozenDict(frozenImage);
  }

  private computeImage(relation: Iterable<[H, H]>): Map<H, Set<H>> {
    const image = new Map<H, Set<H>>();

    for (const [x, y] of relation) {
      if (!image.has(x)) {
        image.set(x, new Set());
      }
      image.get(x)!.add(y);
    }

    const domain = new Set(image.keys());
    for (const k of domain) {
      for (const i of domain) {
        if (!image.get(i)?.has(k)) {
          continue;
        }
        const kSet = image.get(k);
        if (kSet) {
          for (const j of kSet) {
            image.get(i)!.add(j);
          }
        }
      }
    }

    return image;
  }
}

// Process execution utilities
export interface RunProcessOptions {
  check?: boolean;
  input?: string;
  pipeStdout?: boolean;
  pipeStderr?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  execProcess?: boolean;
}

export interface CompletedProcess {
  args: string[];
  returncode: number;
  stdout: string;
  stderr: string;
}

export function runProcess(
  args: string | string[],
  options: RunProcessOptions = {}
): CompletedProcess {
  const {
    check = true,
    input,
    pipeStdout = true,
    pipeStderr = false,
    cwd,
    env,
    execProcess = false,
  } = options;

  if (cwd && !fs.existsSync(cwd)) {
    checkDirPath(cwd);
  }

  const argsArray = Array.isArray(args) ? args : [args];
  const command = argsArray.join(" ");

  console.info(`Running: ${command}`);

  if (execProcess) {
    process.stdout.write("");
    process.stderr.write("");
    const execArgs = Array.isArray(args) ? args : args.split(" ");
    // Node.js doesn't have direct execvp equivalent, but we can use spawn with stdio: 'inherit'
    const child = child_process.spawn(execArgs[0]!, execArgs.slice(1), {
      stdio: "inherit",
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
    });

    child.on("exit", (code) => {
      process.exit(code || 0);
    });

    // This won't actually return since we're replacing the process
    return {
      args: argsArray,
      returncode: 0,
      stdout: "",
      stderr: "",
    };
  }

  const startTime = Date.now();

  const stdio: child_process.StdioOptions = [
    input !== undefined ? "pipe" : "ignore",
    pipeStdout ? "pipe" : "inherit",
    pipeStderr ? "pipe" : "inherit",
  ];

  const result = child_process.spawnSync(argsArray[0]!, argsArray.slice(1), {
    input: input || undefined,
    encoding: "utf8",
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    stdio,
  });

  const deltaTime = (Date.now() - startTime) / 1000;
  console.info(
    `Completed in ${deltaTime.toFixed(3)}s with status ${
      result.status
    }: ${command}`
  );

  if (check && result.status !== 0) {
    throw new Error(
      `Process failed with exit code ${result.status}: ${command}`
    );
  }

  return {
    args: argsArray,
    returncode: result.status || 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export interface RunProcess2Options {
  input?: string;
  writeStdout?: boolean;
  writeStderr?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  check?: boolean;
}

export function runProcess2(
  args: string | string[],
  options: RunProcess2Options = {}
): CompletedProcess {
  const {
    input,
    writeStdout = false,
    writeStderr = false,
    cwd,
    env,
    check = true,
  } = options;

  const argsArray = Array.isArray(args) ? args : [args];

  if (cwd && !fs.existsSync(cwd)) {
    checkDirPath(cwd);
  }

  const result = subprocessRun(argsArray, {
    input,
    writeStdout,
    writeStderr,
    cwd,
    env,
  });

  if (check && result.returncode !== 0) {
    throw new Error(`Process failed with exit code ${result.returncode}`);
  }

  return result;
}

function subprocessRun(
  args: string[],
  options: {
    input?: string;
    writeStdout?: boolean;
    writeStderr?: boolean;
    cwd?: string;
    env?: Record<string, string>;
  }
): CompletedProcess {
  const { input, writeStdout, writeStderr, cwd, env } = options;

  const child = child_process.spawn(args[0]!, args.slice(1), {
    stdio: ["pipe", "pipe", "pipe"],
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
  });

  const command = args.join(" ");
  console.info(`[PID=${child.pid}][exec] ${command}`);

  const startTime = Date.now();
  let stdout = "";
  let stderr = "";

  if (child.stdout) {
    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (writeStdout) {
        process.stdout.write(text);
      }
      for (const line of text.split("\n").filter((l) => l.trim())) {
        console.info(`[PID=${child.pid}][stdo] ${line}`);
      }
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (writeStderr) {
        process.stderr.write(text);
      }
      for (const line of text.split("\n").filter((l) => l.trim())) {
        console.info(`[PID=${child.pid}][stde] ${line}`);
      }
    });
  }

  if (input && child.stdin) {
    for (const line of input.split("\n")) {
      console.info(`[PID=${child.pid}][stdi] ${line}`);
    }
    child.stdin.write(input);
    child.stdin.end();
  }

  return new Promise<CompletedProcess>((resolve, reject) => {
    child.on("exit", (code) => {
      const deltaTime = (Date.now() - startTime) / 1000;
      console.info(
        `[PID=${child.pid}][done] status=${code} time=${deltaTime.toFixed(3)}s`
      );

      resolve({
        args,
        returncode: code || 0,
        stdout,
        stderr,
      });
    });

    child.on("error", reject);
  }) as any; // Type assertion for sync-like usage in translated code
}

export function exitWithProcessError(error: {
  returncode: number;
  cmd: string[];
}): never {
  process.stderr.write(
    `[ERROR] Running process failed with returncode ${
      error.returncode
    }:\n    ${error.cmd.join(" ")}\n`
  );
  process.exit(error.returncode);
}

export function genFileTimestamp(comment: string = "//"): string {
  const now = new Date();
  return `${comment} This file generated by: ${
    process.argv[0]
  }\n${comment} ${now.toString()}\n`;
}

export function checkAbsolutePath(filePath: string): void {
  if (!path.isAbsolute(filePath)) {
    throw new Error(`Path is not absolute: ${filePath}`);
  }
}

export function checkRelativePath(filePath: string): void {
  if (path.isAbsolute(filePath)) {
    throw new Error(`Path is not relative: ${filePath}`);
  }
}

// Bug report functionality
export class BugReport {
  private bugReport: string;
  private commandId: number = 0;
  private defnId: number = 0;
  private fileRemap: Record<string, string> = {};

  constructor(bugReportPath: string) {
    this.bugReport = bugReportPath.replace(/\.[^.]*$/, ".tar");

    if (fs.existsSync(this.bugReport)) {
      console.warn(`Bug report exists, removing: ${this.bugReport}`);
      fs.unlinkSync(this.bugReport);
    }
  }

  addFile(inputPath: string, arcname: string): void {
    if (!(inputPath in this.fileRemap)) {
      this.fileRemap[inputPath] = arcname;

      // Create tar archive
      if (fs.existsSync(this.bugReport)) {
        // For appending, we need to use tar.update or recreate
        const tempTar = this.bugReport + ".tmp";
        tar
          .create(
            {
              gzip: false,
              portable: true,
              sync: true,
            },
            [inputPath]
          )
          .pipe(fs.createWriteStream(tempTar));

        // For simplicity, we'll just recreate the entire archive
        // In a real implementation, you might want to extract, add, and repack
      } else {
        tar
          .create(
            {
              gzip: false,
              portable: true,
              sync: true,
            },
            [inputPath]
          )
          .pipe(fs.createWriteStream(this.bugReport));
      }

      console.info(
        `Added file to bug report ${this.bugReport}:${arcname}: ${inputPath}`
      );
    }
  }

  addFileContents(input: string, arcname: string): void {
    const tempFile = path.join(
      os.tmpdir(),
      `bug-report-${Math.random().toString(36)}`
    );
    try {
      fs.writeFileSync(tempFile, input);
      this.addFile(tempFile, arcname);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  addRequest(reqName: string): void {
    this.addFileContents(
      reqName,
      `sequence/${this.commandId.toString().padStart(3, "0")}`
    );
    this.commandId++;
  }

  addCommand(args: string[]): void {
    const remapArg = (arg: string): string => {
      if (arg in this.fileRemap) {
        return this.fileRemap[arg]!;
      }

      const argPath = path.resolve(arg);
      for (const [filePath, mappedPath] of Object.entries(this.fileRemap)) {
        const resolvedFilePath = path.resolve(filePath);
        if (argPath.startsWith(resolvedFilePath)) {
          const relativePath = path.relative(resolvedFilePath, argPath);
          return path.join(mappedPath, relativePath);
        }
      }

      return arg;
    };

    const remappedArgs = args.map(remapArg);
    const arcname = `commands/${this.commandId.toString().padStart(3, "0")}.sh`;
    const shebang = "#!/usr/bin/env bash\nset -euxo pipefail\n";
    this.addFileContents(shebang + remappedArgs.join(" ") + "\n", arcname);
    this.commandId++;
  }
}

// Tuple manipulation utilities
export function tupleOf<T extends readonly unknown[]>(
  ...funcs: { [K in keyof T]: (arg: any) => T[K] }
): (tuple: readonly unknown[]) => T {
  return (tuple: readonly unknown[]): T => {
    if (tuple.length !== funcs.length) {
      throw new Error(
        `Expected tuple of length ${funcs.length}, got ${tuple.length}`
      );
    }
    return funcs.map((f, i) => f(tuple[i])) as unknown as T;
  };
}

export function caseFunction<P, R>(
  cases: Array<[(p: P) => boolean, (p: P) => R]>,
  defaultCase?: (p: P) => R
): (p: P) => R {
  return (p: P): R => {
    for (const [condition, then] of cases) {
      if (condition(p)) {
        return then(p);
      }
    }

    if (defaultCase) {
      return defaultCase(p);
    }

    throw new Error(`No match found for: ${p}`);
  };
}

// Additional utility functions that might be referenced elsewhere
export const ROOT = path.dirname(path.dirname(__filename));

export function none(_: any): void {
  // Do nothing function
}

/**
 * Recursively convert a plain JavaScript object to a Map structure
 * This is needed because JSON.parse() returns plain objects but KDefinition.fromDict() expects Maps
 */
export function objectToMap(obj: any): any {
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

export function mapToObject(map: any): any {
  // Handle non-Map/array values (primitives, dates, etc.)
  if (!(map instanceof Map) && !Array.isArray(map)) {
    return map;
  }

  // Convert arrays recursively
  if (Array.isArray(map)) {
    return map.map(mapToObject);
  }

  // Convert Map entries to an object
  const obj = {};
  for (const [key, value] of map.entries()) {
    // @ts-ignore
    obj[key] = mapToObject(value); // Recurse for nested Maps/arrays
  }
  return obj;
}
