import { Atts, KAtt } from "./att";
import {
  flattenLabel,
  KApply,
  KAs,
  KInner,
  KLabel,
  KRewrite,
  KSequence,
  KSort,
  KToken,
  KVariable,
} from "./inner";
import type { KAst } from "./kast";
import { sortAcCollections } from "./manip";
import {
  KBubble,
  KClaim,
  KContext,
  KDefinition,
  KFlatModule,
  KImport,
  KNonTerminal,
  KOuter,
  KProduction,
  KRegexTerminal,
  KRequire,
  KRule,
  KSortSynonym,
  KSyntaxAssociativity,
  KSyntaxLexical,
  KSyntaxPriority,
  KSyntaxSort,
  KTerminal,
} from "./outer";
import { TRUE } from "./prelude/kbool";

type SymbolTable = Map<string, (...args: string[]) => string>;

export class PrettyPrinter {
  public readonly definition: KDefinition;
  private readonly extraUnparsingModules: KFlatModule[];
  private readonly patchSymbolTable?: (symbolTable: SymbolTable) => void;
  private readonly unalias: boolean;
  private readonly sortCollections: boolean;
  private cachedSymbolTable?: SymbolTable;

  constructor(options: {
    definition: KDefinition;
    extraUnparsingModules?: KFlatModule[];
    patchSymbolTable?: (symbolTable: SymbolTable) => void;
    unalias?: boolean;
    sortCollections?: boolean;
  }) {
    this.definition = options.definition;
    this.extraUnparsingModules = options.extraUnparsingModules || [];
    this.patchSymbolTable = options.patchSymbolTable;
    this.unalias = options.unalias ?? true;
    this.sortCollections = options.sortCollections ?? false;
  }

  get symbolTable(): SymbolTable {
    if (!this.cachedSymbolTable) {
      this.cachedSymbolTable = buildSymbolTable(
        this.definition,
        this.extraUnparsingModules,
        true
      );
      if (this.patchSymbolTable) {
        this.patchSymbolTable(this.cachedSymbolTable);
      }
    }
    return this.cachedSymbolTable;
  }

  print(kast: KAst): string {
    console.debug(`Unparsing: ${kast}`);

    if (kast instanceof KAtt) {
      return this.printKAtt(kast);
    }
    if (kast instanceof KSort) {
      return this.printKSort(kast);
    }
    if (kast instanceof KLabel) {
      return this.printKLabel(kast);
    }
    if (kast instanceof KOuter) {
      return this.printKOuter(kast);
    }
    if (kast instanceof KInner) {
      let inner = kast;
      if (this.unalias) {
        inner = undoAliases(this.definition, inner);
      }
      if (this.sortCollections) {
        inner = sortAcCollections(inner);
      }
      return this.printKInner(inner);
    }

    throw new Error(`Error unparsing: ${kast}`);
  }

  private printKOuter(kast: KOuter): string {
    if (kast instanceof KTerminal) {
      return this.printKTerminal(kast);
    }
    if (kast instanceof KRegexTerminal) {
      return this.printKRegexTerminal(kast);
    }
    if (kast instanceof KNonTerminal) {
      return this.printKNonTerminal(kast);
    }
    if (kast instanceof KProduction) {
      return this.printKProduction(kast);
    }
    if (kast instanceof KSyntaxSort) {
      return this.printKSyntaxSort(kast);
    }
    if (kast instanceof KSortSynonym) {
      return this.printKSortSynonym(kast);
    }
    if (kast instanceof KSyntaxLexical) {
      return this.printKSyntaxLexical(kast);
    }
    if (kast instanceof KSyntaxAssociativity) {
      return this.printKSyntaxAssociativity(kast);
    }
    if (kast instanceof KSyntaxPriority) {
      return this.printKSyntaxPriority(kast);
    }
    if (kast instanceof KBubble) {
      return this.printKBubble(kast);
    }
    if (kast instanceof KRule) {
      return this.printKRule(kast);
    }
    if (kast instanceof KClaim) {
      return this.printKClaim(kast);
    }
    if (kast instanceof KContext) {
      return this.printKContext(kast);
    }
    if (kast instanceof KImport) {
      return this.printKImport(kast);
    }
    if (kast instanceof KFlatModule) {
      return this.printKFlatModule(kast);
    }
    if (kast instanceof KRequire) {
      return this.printKRequire(kast);
    }
    if (kast instanceof KDefinition) {
      return this.printKDefinition(kast);
    }

    throw new Error(`Error unparsing: ${kast}`);
  }

  private printKInner(kast: KInner): string {
    if (kast instanceof KVariable) {
      return this.printKVariable(kast);
    }
    if (kast instanceof KToken) {
      return this.printKToken(kast);
    }
    if (kast instanceof KApply) {
      return this.printKApply(kast);
    }
    if (kast instanceof KAs) {
      return this.printKAs(kast);
    }
    if (kast instanceof KRewrite) {
      return this.printKRewrite(kast);
    }
    if (kast instanceof KSequence) {
      return this.printKSequence(kast);
    }

    throw new Error(`Error unparsing: ${kast}`);
  }

  private printKSort(ksort: KSort): string {
    return ksort.name;
  }

  private printKLabel(klabel: KLabel): string {
    return klabel.name;
  }

  private printKVariable(kvariable: KVariable): string {
    if (!kvariable.sort) {
      return kvariable.name;
    }
    return `${kvariable.name}:${kvariable.sort.name}`;
  }

  private printKToken(ktoken: KToken): string {
    return ktoken.token;
  }

  private printKApply(kapply: KApply): string {
    const label = kapply.label.name;
    const args = kapply.args;
    const unparsedArgs = args.map((arg) => this.printKInner(arg));

    if (kapply.isCell) {
      const cellContents = unparsedArgs.join("\n").trimEnd();
      const cellStr = `${label}\n${indent(cellContents)}\n</${label.slice(1)}`;
      return cellStr.trimEnd();
    }

    const unparser = this.symbolTable.has(label)
      ? this.symbolTable.get(label)!
      : this.appliedLabelStr(label);

    return unparser(...unparsedArgs);
  }

  private printKAs(kas: KAs): string {
    const patternStr = this.printKInner(kas.pattern);
    const aliasStr = this.printKInner(kas.alias);
    return `${patternStr} #as ${aliasStr}`;
  }

  private printKRewrite(krewrite: KRewrite): string {
    const lhsStr = this.printKInner(krewrite.lhs);
    const rhsStr = this.printKInner(krewrite.rhs);
    return `( ${lhsStr} => ${rhsStr} )`;
  }

  private printKSequence(ksequence: KSequence): string {
    if (ksequence.arity === 0) {
      return ".K";
    }
    if (ksequence.arity === 1) {
      return `${this.printKInner(ksequence.items[0]!)} ~> .K`;
    }

    const items = ksequence.items;
    const unparsedKSeq = items
      .slice(0, -1)
      .map((item) => this.printKInner(item))
      .join("\n~> ");

    const lastItem = items[items.length - 1];
    if (
      lastItem instanceof KToken &&
      lastItem.token === "..." &&
      lastItem.sort.name === "K"
    ) {
      return `${unparsedKSeq}\n${this.printKInner(lastItem)}`;
    } else {
      return `${unparsedKSeq}\n~> ${this.printKInner(lastItem!)}`;
    }
  }

  private printKTerminal(kterminal: KTerminal): string {
    return `"${kterminal.value}"`;
  }

  private printKRegexTerminal(kregexterminal: KRegexTerminal): string {
    return `r"${kregexterminal.regex}"`;
  }

  private printKNonTerminal(knonterminal: KNonTerminal): string {
    return this.print(knonterminal.sort);
  }

  private printKProduction(kproduction: KProduction): string {
    let syntaxStr = `syntax ${this.print(kproduction.sort)}`;

    if (kproduction.items.length > 0) {
      const itemsStr = kproduction.items
        .map((pi) => this.printKOuter(pi))
        .join(" ");
      syntaxStr += ` ::= ${itemsStr}`;
    }

    const attStr = this.print(kproduction.att);
    if (attStr) {
      syntaxStr += ` ${attStr}`;
    }

    return syntaxStr;
  }

  private printKSyntaxSort(ksyntaxsort: KSyntaxSort): string {
    const sortStr = this.print(ksyntaxsort.sort);
    const attStr = this.print(ksyntaxsort.att);
    return `syntax ${sortStr} ${attStr}`;
  }

  private printKSortSynonym(ksortsynonym: KSortSynonym): string {
    const newSortStr = this.print(ksortsynonym.newSort);
    const oldSortStr = this.print(ksortsynonym.oldSort);
    const attStr = this.print(ksortsynonym.att);
    return `syntax ${newSortStr} = ${oldSortStr} ${attStr}`;
  }

  private printKSyntaxLexical(ksyntaxlexical: KSyntaxLexical): string {
    const nameStr = ksyntaxlexical.name;
    const regexStr = ksyntaxlexical.regex;
    const attStr = this.print(ksyntaxlexical.att);
    return `syntax lexical ${nameStr} = r"${regexStr}" ${attStr}`;
  }

  private printKSyntaxAssociativity(
    ksyntaxassociativity: KSyntaxAssociativity
  ): string {
    const assocStr = ksyntaxassociativity.assoc;
    const tagsStr = Array.from(ksyntaxassociativity.tags).join(" ");
    const attStr = this.print(ksyntaxassociativity.att);
    return `syntax associativity ${assocStr} ${tagsStr} ${attStr}`;
  }

  private printKSyntaxPriority(ksyntaxpriority: KSyntaxPriority): string {
    const prioritiesStr = ksyntaxpriority.priorities
      .map((group) => Array.from(group).join(" "))
      .join(" > ");
    const attStr = this.print(ksyntaxpriority.att);
    return `syntax priority ${prioritiesStr} ${attStr}`;
  }

  private printKBubble(kbubble: KBubble): string {
    const body = `// KBubble(${kbubble.sentenceType}, ${kbubble.contents})`;
    const attStr = this.print(kbubble.att);
    return `${body} ${attStr}`;
  }

  private printKRule(kterm: KRule): string {
    const body = this.print(kterm.body).split("\n").join("\n     ");
    let ruleStr = "rule ";

    if (kterm.att.has(Atts.LABEL)) {
      ruleStr += `[${kterm.att.get(Atts.LABEL)}]:`;
    }

    ruleStr += ` ${body}`;
    const attsStr = this.print(kterm.att);

    if (kterm.requires !== TRUE) {
      const requiresStr = `requires ${this.printKastBool(kterm.requires)
        .split("\n")
        .join("\n  ")}`;
      ruleStr += `\n  ${requiresStr}`;
    }

    if (kterm.ensures !== TRUE) {
      const ensuresStr = `ensures ${this.printKastBool(kterm.ensures)
        .split("\n")
        .join("\n  ")}`;
      ruleStr += `\n   ${ensuresStr}`;
    }

    return `${ruleStr}\n  ${attsStr}`;
  }

  private printKClaim(kterm: KClaim): string {
    const body = this.print(kterm.body).split("\n").join("\n     ");
    let ruleStr = "claim ";

    if (kterm.att.has(Atts.LABEL)) {
      ruleStr += `[${kterm.att.get(Atts.LABEL)}]:`;
    }

    ruleStr += ` ${body}`;
    const attsStr = this.print(kterm.att);

    if (kterm.requires !== TRUE) {
      const requiresStr = `requires ${this.printKastBool(kterm.requires)
        .split("\n")
        .join("\n  ")}`;
      ruleStr += `\n  ${requiresStr}`;
    }

    if (kterm.ensures !== TRUE) {
      const ensuresStr = `ensures ${this.printKastBool(kterm.ensures)
        .split("\n")
        .join("\n  ")}`;
      ruleStr += `\n   ${ensuresStr}`;
    }

    return `${ruleStr}\n  ${attsStr}`;
  }

  private printKContext(kcontext: KContext): string {
    const body = indent(this.print(kcontext.body));
    const contextStr = `context alias ${body}`;
    let requiresStr = "";
    const attsStr = this.print(kcontext.att);

    if (kcontext.requires !== TRUE) {
      requiresStr = this.print(kcontext.requires);
      requiresStr = `requires ${indent(requiresStr)}`;
    }

    return `${contextStr}\n  ${requiresStr}\n  ${attsStr}`;
  }

  private printKAtt(katt: KAtt): string {
    return katt.pretty;
  }

  private printKImport(kimport: KImport): string {
    const visibility = kimport.public ? "public" : "private";
    return `imports ${visibility} ${kimport.name}`;
  }

  private printKFlatModule(kflatmodule: KFlatModule): string {
    const name = kflatmodule.name;
    const imports = kflatmodule.imports
      .map((kimport) => this.printKOuter(kimport))
      .join("\n");
    const sentences = kflatmodule.sentences
      .map((sentence) => this.printKOuter(sentence))
      .join("\n\n");
    const contents = `${imports}\n\n${sentences}`;
    const indentedContents = contents.split("\n").join("\n    ");
    return `module ${name}\n    ${indentedContents}\n\nendmodule`;
  }

  private printKRequire(krequire: KRequire): string {
    return `requires "${krequire.require}"`;
  }

  private printKDefinition(kdefinition: KDefinition): string {
    const requires = kdefinition.requires
      .map((require) => this.printKOuter(require))
      .join("\n");
    const modules = kdefinition.allModules
      .map((module) => this.printKOuter(module))
      .join("\n\n");
    return `${requires}\n\n${modules}`;
  }

  private printKastBool(kast: KAst): string {
    console.debug(`_print_kast_bool: ${kast}`);

    if (
      kast instanceof KApply &&
      ["_andBool_", "_orBool_"].includes(kast.label.name)
    ) {
      const clauses = flattenLabel(kast.label.name, kast).map((c) =>
        this.printKastBool(c)
      );
      const head = kast.label.name.replace(/_/g, " ");
      const actualHead = head === " orBool " ? "  orBool " : head;
      const separator = " ".repeat(actualHead.length - 7);
      const spacer = " ".repeat(actualHead.length);

      const joinSep = (s: string): string =>
        s.split("\n").join(`\n${separator}`);

      const formattedClauses = [
        `( ${joinSep(clauses[0]!)}`,
        ...clauses.slice(1).map((c) => `${actualHead}( ${joinSep(c)}`),
        spacer + ")".repeat(clauses.length),
      ];

      return formattedClauses.join("\n");
    } else {
      return this.print(kast);
    }
  }

  private appliedLabelStr(symbol: string): (...args: string[]) => string {
    return (...args: string[]) => `${symbol} ( ${args.join(" , ")} )`;
  }
}

export function buildSymbolTable(
  definition: KDefinition,
  extraModules: KFlatModule[] = [],
  opinionated: boolean = false
): SymbolTable {
  const symbolTable = new Map<string, (...args: string[]) => string>();
  const allModules = [...definition.allModules, ...extraModules];

  for (const module of allModules) {
    for (const prod of module.syntaxProductions) {
      if (!prod.klabel) continue;

      const label = prod.klabel.name;
      const unparser = unparserForProduction(prod);

      symbolTable.set(label, unparser);
      if (prod.att.has(Atts.SYMBOL)) {
        symbolTable.set(prod.att.get(Atts.SYMBOL)!, unparser);
      }
    }
  }

  if (opinionated) {
    symbolTable.set("#And", (c1: string, c2: string) => `${c1}\n#And ${c2}`);
    symbolTable.set(
      "#Or",
      (c1: string, c2: string) => `${c1}\n#Or\n${indent(c2, 4)}`
    );
  }

  return symbolTable;
}

export function unparserForProduction(
  prod: KProduction
): (...args: string[]) => string {
  return (...args: string[]): string => {
    let index = 0;
    const result: string[] = [];
    const numNonterm = prod.items.filter(
      (item) => item instanceof KNonTerminal
    ).length;
    const numNamedNonterm = prod.items.filter(
      (item) => item instanceof KNonTerminal && item.name !== null
    ).length;

    for (const item of prod.items) {
      if (item instanceof KTerminal) {
        result.push(item.value);
      } else if (item instanceof KNonTerminal && index < args.length) {
        if (numNonterm === numNamedNonterm) {
          if (index === 0) {
            result.push("...");
          }
          result.push(`${item.name}:`);
        }
        result.push(args[index]!);
        index++;
      }
    }

    return result.join(" ");
  };
}

export function indent(text: string, size: number = 2): string {
  const spaces = " ".repeat(size);
  return text
    .split("\n")
    .map((line) => spaces + line)
    .join("\n");
}

export function paren(
  printer: (...args: string[]) => string
): (...args: string[]) => string {
  return (...args: string[]) => `( ${printer(...args)} )`;
}

export function assocWithUnit(
  assocJoin: string,
  unit: string
): (...args: string[]) => string {
  return (...args: string[]) =>
    args.filter((arg) => arg !== unit).join(assocJoin);
}
