import {
  KApply,
  KInner,
  KSort,
  KToken,
  KVariable,
  flattenLabel,
  topDown,
} from "../kast/inner";
import { freeVars, minimizeTerm } from "../kast/manip";
import { DOTS } from "../kast/prelude/k";
import { PrettyPrinter } from "../kast/pretty";
import { CTerm } from "./cterm";

/**
 * Printer function type that takes a KInner and returns a string representation.
 */
export type Printer = (kast: KInner) => string;

/**
 * Async printer function type that takes a KInner and returns a promise of string representation.
 */
export type AsyncPrinter = (kast: KInner) => Promise<string>;

/**
 * Configuration class for controlling how CTerm instances are displayed.
 *
 * This class provides various options for customizing the output when displaying
 * symbolic program states, including minimization, cell collection breaking,
 * and label omission.
 */
export class CTermShow {
  private readonly _printer: Printer;
  private readonly _asyncPrinter?: AsyncPrinter;
  private readonly _minimize: boolean;
  private readonly _breakCellCollections: boolean;
  private readonly _omitLabels: readonly string[];
  private readonly _yieldFrequency: number;

  constructor(
    printer: Printer,
    minimize: boolean = true,
    breakCellCollections: boolean = true,
    omitLabels: Iterable<string> = [],
    asyncPrinter?: AsyncPrinter,
    yieldFrequency: number = 10
  ) {
    this._printer = printer;
    this._asyncPrinter = asyncPrinter;
    this._minimize = minimize;
    this._breakCellCollections = breakCellCollections;
    this._omitLabels = Array.from(omitLabels);
    this._yieldFrequency = yieldFrequency;
  }

  /**
   * Split the printed representation of a KInner into lines.
   *
   * @param kast - The KInner term to print.
   * @returns An array of strings representing the lines of output.
   */
  public printLines(kast: KInner): string[] {
    return this._printer(kast).split("\n");
  }

  /**
   * Asynchronously split the printed representation of a KInner into lines.
   * This prevents stack overflow when the printer function deals with deeply nested structures.
   *
   * @param kast - The KInner term to print.
   * @returns A promise that resolves to an array of strings representing the lines of output.
   */
  public async printLinesAsync(kast: KInner): Promise<string[]> {
    // Yield control before calling the printer to prevent stack overflow
    await new Promise((resolve) => setTimeout(resolve, 0));

    console.log("= printLinesAsync");
    let printed: string;
    if (this._asyncPrinter) {
      printed = await this._asyncPrinter(kast);
    } else {
      printed = this._printer(kast);
    }

    const result = printed.split("\n");
    return result;
  }

  /**
   * Create a new CTermShow instance with modified settings.
   *
   * @param options - Options to override from the current instance.
   * @returns A new CTermShow instance with the specified options applied.
   */
  public let(
    options: {
      minimize?: boolean;
      breakCellCollections?: boolean;
      omitLabels?: Iterable<string>;
    } = {}
  ): CTermShow {
    return new CTermShow(
      this._printer,
      options.minimize !== undefined ? options.minimize : this._minimize,
      options.breakCellCollections !== undefined
        ? options.breakCellCollections
        : this._breakCellCollections,
      options.omitLabels !== undefined
        ? Array.from(options.omitLabels)
        : this._omitLabels,
      this._asyncPrinter,
      this._yieldFrequency
    );
  }

  /**
   * Generate a complete string representation of a CTerm.
   *
   * @param cterm - The CTerm to display.
   * @returns An array of strings representing the formatted output.
   */
  public show(cterm: CTerm): string[] {
    const retStrs: string[] = [];
    retStrs.push(...this.showConfig(cterm));
    retStrs.push(...this.showConstraints(cterm));
    return retStrs;
  }

  /**
   * Generate a string representation of the configuration part of a CTerm.
   *
   * @param cterm - The CTerm whose configuration should be displayed.
   * @returns An array of strings representing the formatted configuration.
   */
  public showConfig(cterm: CTerm): string[] {
    let workingCterm = cterm;

    if (this._breakCellCollections) {
      workingCterm = new CTerm(
        topDown((kast) => this._breakCellsVisitor(kast), cterm.config),
        cterm.constraints
      );
    }

    if (this._omitLabels.length > 0) {
      workingCterm = new CTerm(
        topDown((kast) => this._omitLabelsVisitor(kast), workingCterm.config),
        workingCterm.constraints
      );
    }

    if (this._minimize) {
      workingCterm = new CTerm(
        minimizeTerm(workingCterm.config, freeVars(workingCterm.constraint)),
        workingCterm.constraints
      );
    }

    return this.printLines(workingCterm.config);
  }

  /**
   * Generate a string representation of the configuration part of a CTerm asynchronously.
   * This prevents stack overflow errors when dealing with deeply nested configurations.
   *
   * @param cterm - The CTerm whose configuration should be displayed.
   * @returns A promise that resolves to an array of strings representing the formatted configuration.
   */
  public async showConfigAsync(cterm: CTerm): Promise<string[]> {
    let workingCterm = cterm;

    if (this._breakCellCollections) {
      workingCterm = new CTerm(
        await this._topDownAsyncVisitor(
          (kast) => this._breakCellsVisitorAsync(kast),
          cterm.config
        ),
        cterm.constraints
      );
    }

    if (this._omitLabels.length > 0) {
      workingCterm = new CTerm(
        await this._topDownAsync(
          (kast) => this._omitLabelsVisitor(kast),
          workingCterm.config
        ),
        workingCterm.constraints
      );
    }

    if (this._minimize) {
      workingCterm = new CTerm(
        minimizeTerm(workingCterm.config, freeVars(workingCterm.constraint)),
        workingCterm.constraints
      );
    }

    const result = await this.printLinesAsync(workingCterm.config);
    return result;
  }

  /**
   * Generate a string representation of the constraints part of a CTerm.
   *
   * @param cterm - The CTerm whose constraints should be displayed.
   * @returns An array of strings representing the formatted constraints.
   */
  public showConstraints(cterm: CTerm): string[] {
    const retStrs: string[] = [];

    for (const constraint of cterm.constraints) {
      const constraintStrs = this.printLines(constraint);
      if (constraintStrs.length > 0) {
        const prefixedStrs = constraintStrs.map((cstr, index) =>
          index === 0 ? `#And ${cstr}` : `  ${cstr}`
        );
        retStrs.push(...prefixedStrs);
      }
    }

    return retStrs;
  }

  /**
   * Visitor function that breaks down cell collections for better readability.
   *
   * When a cell contains a collection (_Set_, _List_, or _Map_), this function
   * will flatten the collection and represent each item on a separate line.
   *
   * @param kast - The KInner term to potentially transform.
   * @returns The transformed term or the original term if no transformation is needed.
   */
  private _breakCellsVisitor(kast: KInner): KInner {
    if (
      kast instanceof KApply &&
      kast.isCell &&
      kast.args.length === 1 &&
      kast.args[0] instanceof KApply &&
      ["_Set_", "_List_", "_Map_"].includes(kast.args[0].label.name)
    ) {
      const items = flattenLabel(kast.args[0].label.name, kast.args[0]);
      const printed = new KToken(
        items.map((item) => this._printer(item)).join("\n"),
        new KSort(kast.label.name.slice(1, -1)) // Remove < and > from cell name
      );
      return new KApply(kast.label, [printed]);
    }
    return kast;
  }

  /**
   * Async visitor function that breaks down cell collections for better readability.
   * This prevents stack overflow when processing large collections.
   *
   * @param kast - The KInner term to potentially transform.
   * @returns A promise that resolves to the transformed term or the original term if no transformation is needed.
   */
  private async _breakCellsVisitorAsync(kast: KInner): Promise<KInner> {
    if (
      kast instanceof KApply &&
      kast.isCell &&
      kast.args.length === 1 &&
      kast.args[0] instanceof KApply &&
      ["_Set_", "_List_", "_Map_"].includes(kast.args[0].label.name)
    ) {
      const items = flattenLabel(kast.args[0].label.name, kast.args[0]);

      // Process items asynchronously to prevent stack overflow
      const printedItems: string[] = [];
      for (let i = 0; i < items.length; i++) {
        // Yield control periodically
        if (i % this._yieldFrequency === 0 && i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const item = items[i];
        if (item) {
          printedItems.push(this._printer(item));
        }
      }

      const printed = new KToken(
        printedItems.join("\n"),
        new KSort(kast.label.name.slice(1, -1)) // Remove < and > from cell name
      );
      return new KApply(kast.label, [printed]);
    }
    return kast;
  }

  /**
   * Visitor function that replaces specified labels with dots (...).
   *
   * This is useful for hiding parts of the configuration that are not
   * relevant to the current analysis or display.
   *
   * @param kast - The KInner term to potentially transform.
   * @returns DOTS if the term's label should be omitted, otherwise the original term.
   */
  private _omitLabelsVisitor(kast: KInner): KInner {
    if (kast instanceof KApply && this._omitLabels.includes(kast.label.name)) {
      return DOTS;
    }
    return kast;
  }

  /**
   * Asynchronous version of topDown traversal to prevent stack overflow.
   * Similar to the fromDictAsync pattern in KInner class.
   *
   * @param f - The transformation function to apply to each node.
   * @param term - The term to traverse.
   * @param depth - Current recursion depth.
   * @returns A promise that resolves to the transformed term.
   */
  private async _topDownAsync(
    f: (term: KInner) => KInner,
    term: KInner,
    depth: number = 0
  ): Promise<KInner> {
    // Every yieldFrequency levels, yield control to prevent stack overflow
    if (depth % this._yieldFrequency === 0 && depth > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const transformedTerm = f(term);

    if (transformedTerm.terms.length === 0) {
      return transformedTerm;
    }

    // Process all child terms asynchronously
    const transformedChildren = await Promise.all(
      transformedTerm.terms.map((childTerm) =>
        this._topDownAsync(f, childTerm, depth + 1)
      )
    );

    return transformedTerm.letTerms(transformedChildren);
  }

  /**
   * Asynchronous version of topDown traversal with async visitor function.
   * This version supports visitor functions that return promises.
   *
   * @param f - The async transformation function to apply to each node.
   * @param term - The term to traverse.
   * @param depth - Current recursion depth.
   * @returns A promise that resolves to the transformed term.
   */
  private async _topDownAsyncVisitor(
    f: (term: KInner) => Promise<KInner>,
    term: KInner,
    depth: number = 0
  ): Promise<KInner> {
    // Every yieldFrequency levels, yield control to prevent stack overflow
    if (depth % this._yieldFrequency === 0 && depth > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const transformedTerm = await f(term);

    if (transformedTerm.terms.length === 0) {
      return transformedTerm;
    }

    // Process all child terms asynchronously
    const transformedChildren = await Promise.all(
      transformedTerm.terms.map((childTerm) =>
        this._topDownAsyncVisitor(f, childTerm, depth + 1)
      )
    );

    return transformedTerm.letTerms(transformedChildren);
  }
}

/**
 * Create a CTermShow instance with async printing support for PrettyPrinter.
 * This helps prevent stack overflow when dealing with deeply nested structures.
 *
 * @param prettyPrinter - The PrettyPrinter instance to use for printing.
 * @param options - Configuration options for the CTermShow.
 * @returns A CTermShow instance with both sync and async printing capabilities.
 */
export function createAsyncCTermShow(
  prettyPrinter: PrettyPrinter,
  options: {
    minimize?: boolean;
    breakCellCollections?: boolean;
    omitLabels?: Iterable<string>;
    yieldFrequency?: number;
  } = {}
): CTermShow {
  console.log("createAsyncCTermShow called");
  const yieldFreq = options.yieldFrequency ?? 1; // Much more aggressive yielding
  const syncPrinter = (kast: KInner) => prettyPrinter.print(kast);

  // Use the new safe async method that converts to dict first
  const asyncPrinter = async (kast: KInner) => {
    try {
      // Try the safe async method first
      return await prettyPrinter.printKInnerSafeAsync(kast);
    } catch (error) {
      console.warn(
        "Safe async printing failed, falling back to regular async:",
        error
      );
      return await prettyPrinter.printAsync(kast);
    }
  };

  return new CTermShow(
    syncPrinter,
    options.minimize ?? true,
    options.breakCellCollections ?? true,
    options.omitLabels || [],
    asyncPrinter,
    yieldFreq
  );
}

/**
 * Create a browser-safe CTermShow that limits processing depth and chunks large structures
 */
export function createBrowserSafeCTermShow(
  prettyPrinter: PrettyPrinter,
  options: {
    minimize?: boolean;
    breakCellCollections?: boolean;
    omitLabels?: Iterable<string>;
    yieldFrequency?: number;
    maxDepth?: number;
    maxNodes?: number;
  } = {}
): CTermShow {
  console.log("createBrowserSafeCTermShow called");
  const yieldFreq = options.yieldFrequency ?? 1;
  const maxDepth = options.maxDepth ?? 50; // Much lower depth limit for browser
  const maxNodes = options.maxNodes ?? 1000; // Limit total nodes processed

  const syncPrinter = (kast: KInner) => {
    // For browser, use a simplified printer that truncates deep structures
    return printWithLimits(kast, maxDepth, maxNodes);
  };

  const asyncPrinter = async (kast: KInner) => {
    // Use chunked processing for async
    return await printWithChunking(kast, maxDepth, maxNodes, yieldFreq);
  };

  return new CTermShow(
    syncPrinter,
    options.minimize ?? false, // Disable minimize to avoid recursion
    options.breakCellCollections ?? false, // Disable cell breaking
    options.omitLabels || [],
    asyncPrinter,
    yieldFreq
  );
}

/**
 * Print with depth and node limits to prevent stack overflow
 */
function printWithLimits(
  kast: KInner,
  maxDepth: number,
  maxNodes: number
): string {
  let nodeCount = 0;

  function printLimited(node: KInner, depth: number): string {
    nodeCount++;

    if (depth > maxDepth || nodeCount > maxNodes) {
      return "..."; // Truncate deeply nested or large structures
    }

    if (node instanceof KToken) {
      return node.token;
    }

    if (node instanceof KVariable) {
      return node.sort ? `${node.name}:${node.sort.name}` : node.name;
    }

    if (node instanceof KApply) {
      if (node.args.length === 0) {
        return node.label.name;
      }

      const argStrs = node.args
        .slice(0, 10)
        .map((arg) => printLimited(arg, depth + 1)); // Limit args
      if (node.args.length > 10) {
        argStrs.push("...");
      }

      if (node.isCell) {
        return `<${node.label.name.slice(1, -1)}>\n  ${argStrs.join(
          "\n  "
        )}\n</${node.label.name.slice(1, -1)}>`;
      }

      return `${node.label.name}(${argStrs.join(", ")})`;
    }

    // For other types, return a safe representation
    return node.constructor.name + "(<complex>)";
  }

  return printLimited(kast, 0);
}

/**
 * Async chunked processing that yields frequently
 */
async function printWithChunking(
  kast: KInner,
  maxDepth: number,
  maxNodes: number,
  yieldFreq: number
): Promise<string> {
  let nodeCount = 0;
  let operationCount = 0;

  async function printChunked(node: KInner, depth: number): Promise<string> {
    nodeCount++;
    operationCount++;

    // Yield very frequently in browser
    if (operationCount % yieldFreq === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (depth > maxDepth || nodeCount > maxNodes) {
      return "...";
    }

    if (node instanceof KToken) {
      return node.token;
    }

    if (node instanceof KVariable) {
      return node.sort ? `${node.name}:${node.sort.name}` : node.name;
    }

    if (node instanceof KApply) {
      if (node.args.length === 0) {
        return node.label.name;
      }

      // Process args one by one with yielding
      const argStrs: string[] = [];
      const argsToProcess = Math.min(node.args.length, 10); // Limit processing

      for (let i = 0; i < argsToProcess; i++) {
        const argStr = await printChunked(node.args[i]!, depth + 1);
        argStrs.push(argStr);
      }

      if (node.args.length > 10) {
        argStrs.push("...");
      }

      if (node.isCell) {
        return `<${node.label.name.slice(1, -1)}>\n  ${argStrs.join(
          "\n  "
        )}\n</${node.label.name.slice(1, -1)}>`;
      }

      return `${node.label.name}(${argStrs.join(", ")})`;
    }

    return node.constructor.name + "(<complex>)";
  }

  return await printChunked(kast, 0);
}

/**
 * Create a browser-safe CTermShow that completely avoids deep recursion
 * by using the PrettyPrinter's iterative methods
 */
export function createUltraSafeCTermShow(
  prettyPrinter: PrettyPrinter,
  options: {
    minimize?: boolean;
    breakCellCollections?: boolean;
    omitLabels?: Iterable<string>;
    yieldFrequency?: number;
  } = {}
): CTermShow {
  console.log(
    "createUltraSafeCTermShow called - using PrettyPrinter iterative mode"
  );
  const yieldFreq = options.yieldFrequency ?? 1;

  const syncPrinter = (kast: KInner) => {
    // Use the PrettyPrinter's iterative method for proper formatting
    return prettyPrinter.printKInnerIteratively(kast);
  };

  const asyncPrinter = async (kast: KInner) => {
    // Use the safe async method that converts to dict first then prints iteratively
    return await prettyPrinter.printKInnerSafeAsync(kast);
  };

  return new CTermShow(
    syncPrinter,
    options.minimize ?? false,
    options.breakCellCollections ?? false,
    options.omitLabels || [],
    asyncPrinter,
    yieldFreq
  );
}

/**
 * Iterative printer that uses explicit stacks instead of recursion
 */
function printIteratively(kast: KInner): string {
  type StackItem = {
    node: KInner;
    type: "process" | "combine";
    childrenNeeded?: number;
    childrenCollected?: string[];
  };

  const stack: StackItem[] = [{ node: kast, type: "process" }];
  const resultStack: string[] = [];

  while (stack.length > 0) {
    const item = stack.pop()!;

    if (item.type === "combine") {
      // Collect the required number of children from resultStack
      const node = item.node;
      const childrenNeeded = item.childrenNeeded || 0;
      const children: string[] = [];

      // Pop the children results from the result stack
      for (let i = 0; i < childrenNeeded; i++) {
        const child = resultStack.pop();
        if (child !== undefined) {
          children.unshift(child); // Reverse order since we're popping
        }
      }

      let result: string;
      if (node instanceof KApply) {
        if (children.length === 0) {
          result = node.label.name;
        } else if (node.isCell) {
          const cellName = node.label.name.slice(1, -1);
          result = `<${cellName}>\n  ${children.join("\n  ")}\n</${cellName}>`;
        } else {
          result = `${node.label.name}(${children.join(", ")})`;
        }
      } else {
        result = children.join(" ");
      }

      resultStack.push(result);
      continue;
    }

    // Process a node
    const node = item.node;

    if (node instanceof KToken) {
      resultStack.push(node.token);
    } else if (node instanceof KVariable) {
      resultStack.push(
        node.sort ? `${node.name}:${node.sort.name}` : node.name
      );
    } else if (node instanceof KApply) {
      if (node.args.length === 0) {
        resultStack.push(node.label.name);
      } else {
        // Push combine operation first (will be processed after children)
        stack.push({
          node,
          type: "combine",
          childrenNeeded: node.args.length,
        });

        // Push children in reverse order (stack is LIFO)
        for (let i = node.args.length - 1; i >= 0; i--) {
          stack.push({
            node: node.args[i]!,
            type: "process",
          });
        }
      }
    } else {
      resultStack.push(`${node.constructor.name}(<...>)`);
    }
  }

  return resultStack.pop() || "";
}

/**
 * Async iterative printer with yielding
 */
async function printIterativelyAsync(
  kast: KInner,
  yieldFreq: number
): Promise<string> {
  type StackItem = {
    node: KInner;
    type: "process" | "combine";
    childrenNeeded?: number;
  };

  const stack: StackItem[] = [{ node: kast, type: "process" }];
  const resultStack: string[] = [];
  let operations = 0;

  while (stack.length > 0) {
    operations++;

    // Yield control very frequently in browser
    if (operations % yieldFreq === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const item = stack.pop()!;

    if (item.type === "combine") {
      // Collect the required number of children from resultStack
      const node = item.node;
      const childrenNeeded = item.childrenNeeded || 0;
      const children: string[] = [];

      // Pop the children results from the result stack
      for (let i = 0; i < childrenNeeded; i++) {
        const child = resultStack.pop();
        if (child !== undefined) {
          children.unshift(child); // Reverse order since we're popping
        }
      }

      let result: string;
      if (node instanceof KApply) {
        if (children.length === 0) {
          result = node.label.name;
        } else if (node.isCell) {
          const cellName = node.label.name.slice(1, -1);
          result = `<${cellName}>\n  ${children.join("\n  ")}\n</${cellName}>`;
        } else {
          result = `${node.label.name}(${children.join(", ")})`;
        }
      } else {
        result = children.join(" ");
      }

      resultStack.push(result);
      continue;
    }

    // Process a node
    const node = item.node;

    if (node instanceof KToken) {
      resultStack.push(node.token);
    } else if (node instanceof KVariable) {
      resultStack.push(
        node.sort ? `${node.name}:${node.sort.name}` : node.name
      );
    } else if (node instanceof KApply) {
      if (node.args.length === 0) {
        resultStack.push(node.label.name);
      } else {
        // Push combine operation first
        stack.push({
          node,
          type: "combine",
          childrenNeeded: node.args.length,
        });

        // Push all children in reverse order
        for (let i = node.args.length - 1; i >= 0; i--) {
          stack.push({
            node: node.args[i]!,
            type: "process",
          });
        }
      }
    } else {
      resultStack.push(`${node.constructor.name}(<...>)`);
    }
  }

  return resultStack.pop() || "";
}
