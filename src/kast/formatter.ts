import { intersperse } from "../utils";
import { Atts, Format, KAtt } from "./att";
import {
  KApply,
  KInner,
  KSequence,
  KSort,
  KToken,
  KVariable,
  bottomUp,
} from "./inner";
import {
  KDefinition,
  KNonTerminal,
  KProduction,
  KRegexTerminal,
  KTerminal,
} from "./outer";
import { K_ITEM } from "./prelude/k";

/**
 * Notes on _DEFAULT_BRACKET
 * -------------------------
 *
 * Module KSEQ defines the following production:
 *
 * syntax {Sort} Sort ::= "(" Sort ")" [bracket, group(defaultBracket), applyPriority(1)]
 *
 * For pretty printing, the K Frontend instantiates a module where parametric productions,
 * including this one, are instantiated with actual sorts.
 *
 * _DEFAULT_BRACKET emulates this behavior without the need of actually constructing the module.
 *
 * Since the default bracket production is not included in syntaxDefinition.kore,
 * the pretty printer of the LLVM backend follows a similar approach (on the KORE level).
 */
const _DEFAULT_BRACKET_LABEL = "__bracket__";
const _DEFAULT_BRACKET = new KProduction(
  K_ITEM, // sort is irrelevant
  [
    new KTerminal("("),
    new KNonTerminal(K_ITEM), // sort is irrelevant
    new KTerminal(")"),
  ],
  [],
  null,
  new KAtt([
    Atts.BRACKET_LABEL.call({ name: _DEFAULT_BRACKET_LABEL }),
    Atts.BRACKET.call(null),
    Atts.FORMAT.call(Format.parse("%1 %2 %3")),
  ])
);

export class Formatter {
  public readonly definition: KDefinition;
  private _indent: number;
  private readonly _brackets: boolean;

  constructor(
    definition: KDefinition,
    options: { indent?: number; brackets?: boolean } = {}
  ) {
    this.definition = definition;
    this._indent = options.indent ?? 0;
    this._brackets = options.brackets ?? true;
  }

  public format(term: KInner): string {
    let processedTerm = term;
    if (this._brackets) {
      processedTerm = addBrackets(this.definition, term);
    }
    return this._format(processedTerm).join("");
  }

  private _format(term: KInner): string[] {
    if (term instanceof KToken) {
      return [term.token];
    } else if (term instanceof KVariable) {
      const sortStr = term.sort ? `:${term.sort.name}` : "";
      return [`${term.name}${sortStr}`];
    } else if (term instanceof KSequence) {
      return this._formatKSequence(term);
    } else if (term instanceof KApply) {
      return this._formatKApply(term);
    } else {
      throw new Error(`Unsupported term: ${term}`);
    }
  }

  private _formatKSequence(ksequence: KSequence): string[] {
    const items = ksequence.items.map((item) => this._format(item));
    items.push([".K"]);
    return Array.from(intersperse(items, [" ~> "])).flat();
  }

  private _formatKApply(kapply: KApply): string[] {
    let production: KProduction;
    if (kapply.label.name === _DEFAULT_BRACKET_LABEL) {
      production = _DEFAULT_BRACKET;
    } else {
      const syntaxSymbols = this.definition.syntaxSymbols;
      if (!syntaxSymbols.has(kapply.label.name)) {
        throw new Error(`Production not found for label: ${kapply.label.name}`);
      }
      production = syntaxSymbols.get(kapply.label.name)!;
    }

    const format = production.att.get(Atts.FORMAT) || production.defaultFormat;
    const result: string[] = [];

    for (const token of format.tokens) {
      const chunks = this._interpretToken(token, production, kapply);
      result.push(...chunks);
    }

    return result;
  }

  private _interpretToken(
    token: string,
    production: KProduction,
    kapply: KApply
  ): string[] {
    if (token[0] !== "%") {
      return [token];
    }

    const escape = token.slice(1);

    if (escape[0] && /\d/.test(escape[0])) {
      const index = parseInt(escape, 10);
      if (isNaN(index)) {
        throw new Error(`Incorrect format escape sequence: ${token}`);
      }
      return this._interpretIndex(index, production, kapply);
    }

    if (escape.length !== 1) {
      throw new Error(`Invalid escape sequence: ${token}`);
    }

    switch (escape) {
      case "n":
        return ["\n", "  ".repeat(this._indent)];
      case "i":
        this._indent += 1;
        return [];
      case "d":
        this._indent -= 1;
        return [];
      case "c":
      case "r":
        return []; // TODO add color support
      default:
        return [escape];
    }
  }

  private _interpretIndex(
    index: number,
    production: KProduction,
    kapply: KApply
  ): string[] {
    if (index <= 0) {
      throw new Error(`Invalid index: ${index}`);
    }
    if (index > production.items.length) {
      throw new Error(
        `Format escape index out of bounds: ${index}: ${production}`
      );
    }

    const item = production.items[index - 1]!;

    if (item instanceof KTerminal) {
      return [item.value];
    } else if (item instanceof KNonTerminal) {
      const argIndex = production.items
        .slice(0, index - 1)
        .filter((item) => item instanceof KNonTerminal).length;

      if (argIndex >= kapply.args.length) {
        throw new Error(
          `NonTerminal index out of bounds: ${argIndex}: ${kapply}`
        );
      }

      const arg = kapply.args[argIndex]!;
      return this._format(arg); // recursive call
    } else if (item instanceof KRegexTerminal) {
      throw new Error(
        `Invalid format index escape to regex terminal: ${index}: ${production}`
      );
    } else {
      throw new Error(`Unknown production item type`);
    }
  }
}

export function addBrackets(definition: KDefinition, term: KInner): KInner {
  function _addBrackets(term: KInner): KInner {
    if (!(term instanceof KApply)) {
      return term;
    }

    const prod = definition.symbols.get(term.label.name);
    if (!prod) {
      throw new Error(`Production not found for label: ${term.label.name}`);
    }

    const args: KInner[] = [];
    let argIndex = -1;

    for (let index = 0; index < prod.items.length; index++) {
      const item = prod.items[index]!;
      if (!(item instanceof KNonTerminal)) {
        continue;
      }

      argIndex += 1;
      const arg = term.args[argIndex]!;
      const bracketedArg = _withBracket(
        definition,
        term,
        arg,
        item.sort,
        index
      );
      args.push(bracketedArg);
    }

    return term.let({ args });
  }

  return bottomUp(_addBrackets, term);
}

function _withBracket(
  definition: KDefinition,
  parent: KApply,
  term: KInner,
  bracketSort: KSort,
  index: number
): KInner {
  if (!_requiresBracket(definition, parent, term, index)) {
    return term;
  }

  const bracketProd = definition.brackets.get(bracketSort);
  if (bracketProd) {
    const bracketLabel =
      bracketProd.att.get(Atts.BRACKET_LABEL)?.name || _DEFAULT_BRACKET_LABEL;
    return new KApply(bracketLabel, [term]);
  } else {
    // Use default bracket
    return new KApply(_DEFAULT_BRACKET_LABEL, [term]);
  }
}

function _requiresBracket(
  definition: KDefinition,
  parent: KApply,
  term: KInner,
  index: number
): boolean {
  if (
    term instanceof KToken ||
    term instanceof KVariable ||
    term instanceof KSequence
  ) {
    return false;
  }

  if (!(term instanceof KApply)) {
    return false;
  }

  if (term.args.length <= 1) {
    return false;
  }

  if (_betweenTerminals(definition, parent, index)) {
    return false;
  }

  if (_associativityWrong(definition, parent, term, index)) {
    return true;
  }

  if (_priorityWrong(definition, parent, term)) {
    return true;
  }

  return false;
}

function _betweenTerminals(
  definition: KDefinition,
  parent: KApply,
  index: number
): boolean {
  const prod = definition.symbols.get(parent.label.name);
  if (!prod) {
    return false;
  }

  if (index === 0 || index === prod.items.length - 1) {
    return false;
  }

  const prevItem = prod.items[index - 1];
  const nextItem = prod.items[index + 1];
  return prevItem instanceof KTerminal && nextItem instanceof KTerminal;
}

function _associativityWrong(
  definition: KDefinition,
  parent: KApply,
  term: KApply,
  index: number
): boolean {
  /**
   * Return whether `term` can appear as the `index`-th child of `parent` according to associativity rules.
   *
   * A left (right) associative symbol cannot appear as the rightmost (leftmost) child of a symbol with equal priority.
   */
  const parentLabel = parent.label.name;
  const termLabel = term.label.name;
  const prod = definition.symbols.get(parentLabel);
  if (!prod) {
    return false;
  }

  // Check if both symbols have the same priority
  const parentPriorities = definition.priorities.get(parentLabel) || new Set();
  const termPriorities = definition.priorities.get(termLabel) || new Set();

  // If they don't have equal priority, associativity doesn't matter for bracketing
  if (
    !parentPriorities.has(termLabel) &&
    !termPriorities.has(parentLabel) &&
    parentLabel !== termLabel
  ) {
    return false;
  }

  // Check left associativity constraints
  const leftAssocs = definition.leftAssocs.get(parentLabel) || new Set();
  if (leftAssocs.has(termLabel)) {
    // Left associative symbols cannot appear as the rightmost child
    const nonTerminalPositions = prod.items
      .map((item, i) => ({ item, index: i }))
      .filter(({ item }) => item instanceof KNonTerminal)
      .map(({ index }) => index);

    const lastNonTerminalPos =
      nonTerminalPositions[nonTerminalPositions.length - 1];
    return index === lastNonTerminalPos;
  }

  // Check right associativity constraints
  const rightAssocs = definition.rightAssocs.get(parentLabel) || new Set();
  if (rightAssocs.has(termLabel)) {
    // Right associative symbols cannot appear as the leftmost child
    const firstNonTerminalPos = prod.items.findIndex(
      (item) => item instanceof KNonTerminal
    );
    return index === firstNonTerminalPos;
  }

  return false;
}

function _priorityWrong(
  definition: KDefinition,
  parent: KApply,
  term: KApply
): boolean {
  /**
   * Return whether `term` can appear as a child of `parent` according to priority rules.
   *
   * A symbol with a lesser priority cannot appear as the child of a symbol with greater priority.
   */
  const parentLabel = parent.label.name;
  const termLabel = term.label.name;

  // Check if parent has higher priority than term
  const parentPriorities = definition.priorities.get(parentLabel);
  if (parentPriorities && parentPriorities.has(termLabel)) {
    return true; // term has lower priority than parent, needs brackets
  }

  // Check overloads
  const overloads = definition.overloads.get(parentLabel);
  if (overloads) {
    for (const overload of overloads) {
      const overloadPriorities = definition.priorities.get(overload);
      if (overloadPriorities && overloadPriorities.has(termLabel)) {
        return true;
      }
    }
  }

  return false;
}
