import {
  KApply,
  KInner,
  KSort,
  KToken,
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
    console.log("printLinesAsync: Starting, about to yield control");
    await new Promise((resolve) => setTimeout(resolve, 0));

    let printed: string;
    if (this._asyncPrinter) {
      console.log("printLinesAsync: Using async printer");
      printed = await this._asyncPrinter(kast);
      console.log("printLinesAsync: Async printer completed");
    } else {
      console.log("printLinesAsync: Using sync printer");
      printed = this._printer(kast);
      console.log("printLinesAsync: Sync printer completed");
    }

    console.log("printLinesAsync: About to split lines");
    const result = printed.split("\n");
    console.log("printLinesAsync: Finished, returning", result.length, "lines");
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
    console.log("showConfigAsync: Starting");
    let workingCterm = cterm;

    if (this._breakCellCollections) {
      console.log("showConfigAsync: About to break cell collections");
      workingCterm = new CTerm(
        await this._topDownAsyncVisitor(
          (kast) => this._breakCellsVisitorAsync(kast),
          cterm.config
        ),
        cterm.constraints
      );
      console.log("showConfigAsync: Finished breaking cell collections");
    } else {
      console.log("showConfigAsync: Skipping cell collection breaking");
    }

    if (this._omitLabels.length > 0) {
      console.log("showConfigAsync: About to omit labels");
      workingCterm = new CTerm(
        await this._topDownAsync(
          (kast) => this._omitLabelsVisitor(kast),
          workingCterm.config
        ),
        workingCterm.constraints
      );
      console.log("showConfigAsync: Finished omitting labels");
    } else {
      console.log("showConfigAsync: Skipping label omission");
    }

    if (this._minimize) {
      console.log("showConfigAsync: About to minimize term");
      workingCterm = new CTerm(
        minimizeTerm(workingCterm.config, freeVars(workingCterm.constraint)),
        workingCterm.constraints
      );
      console.log("showConfigAsync: Finished minimizing term");
    } else {
      console.log("showConfigAsync: Skipping term minimization");
    }

    console.log("showConfigAsync: About to call printLinesAsync");
    const result = await this.printLinesAsync(workingCterm.config);
    console.log("showConfigAsync: Finished printLinesAsync");
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
  const yieldFreq = options.yieldFrequency ?? 1; // Much more aggressive yielding
  const syncPrinter = (kast: KInner) => prettyPrinter.print(kast);
  const asyncPrinter = (kast: KInner) => prettyPrinter.printAsync(kast);

  return new CTermShow(
    syncPrinter,
    options.minimize ?? true,
    options.breakCellCollections ?? true,
    options.omitLabels || [],
    asyncPrinter,
    yieldFreq
  );
}
