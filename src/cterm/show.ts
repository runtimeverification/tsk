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
import { CTerm } from "./cterm";

/**
 * Printer function type that takes a KInner and returns a string representation.
 */
export type Printer = (kast: KInner) => string;

/**
 * Configuration class for controlling how CTerm instances are displayed.
 *
 * This class provides various options for customizing the output when displaying
 * symbolic program states, including minimization, cell collection breaking,
 * and label omission.
 */
export class CTermShow {
  private readonly _printer: Printer;
  private readonly _minimize: boolean;
  private readonly _breakCellCollections: boolean;
  private readonly _omitLabels: readonly string[];

  constructor(
    printer: Printer,
    minimize: boolean = true,
    breakCellCollections: boolean = true,
    omitLabels: Iterable<string> = []
  ) {
    this._printer = printer;
    this._minimize = minimize;
    this._breakCellCollections = breakCellCollections;
    this._omitLabels = Array.from(omitLabels);
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
        : this._omitLabels
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
}
