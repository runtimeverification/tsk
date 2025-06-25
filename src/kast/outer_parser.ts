import { deQuoteString } from "../dequote";
import { Loc, Token, TokenType, outerLexer } from "./outer_lexer";
import {
  Alias,
  Assoc,
  Att,
  Claim,
  Config,
  Context,
  Definition,
  EMPTY_ATT,
  Import,
  Lexical,
  Module,
  NonTerminal,
  PriorityBlock,
  Production,
  Require,
  Rule,
  Sort,
  SortDecl,
  SyntaxAssoc,
  SyntaxDecl,
  SyntaxDefn,
  SyntaxLexical,
  SyntaxPriority,
  SyntaxSynonym,
  Terminal,
  UserList,
  type ProductionItem,
  type ProductionLike,
  type Sentence,
  type StringSentence,
  type SyntaxSentence,
} from "./outer_syntax";

const EOF_TOKEN = new Token("", TokenType.EOF, new Loc(1, 0));

const STRING_SENTENCE: Record<
  number,
  new (bubble: string, label: string, att: Att) => StringSentence
> = {
  [TokenType.KW_ALIAS]: Alias,
  [TokenType.KW_CLAIM]: Claim,
  [TokenType.KW_CONFIG]: Config,
  [TokenType.KW_CONTEXT]: Context,
  [TokenType.KW_RULE]: Rule,
};

const ASSOC_TOKENS = new Set([
  TokenType.KW_LEFT,
  TokenType.KW_RIGHT,
  TokenType.KW_NONASSOC,
]);
const PRODUCTION_TOKENS = new Set([
  TokenType.ID_LOWER,
  TokenType.ID_UPPER,
  TokenType.STRING,
  TokenType.REGEX,
]);
const PRODUCTION_ITEM_TOKENS = new Set([
  TokenType.STRING,
  TokenType.ID_LOWER,
  TokenType.ID_UPPER,
]);
const ID_TOKENS = new Set([TokenType.ID_LOWER, TokenType.ID_UPPER]);
const SIMPLE_BUBBLE_TOKENS = new Set([
  TokenType.KW_CLAIM,
  TokenType.KW_CONFIG,
  TokenType.KW_RULE,
]);
const SORT_DECL_TOKENS = new Set([TokenType.LBRACE, TokenType.ID_UPPER]);
const USER_LIST_IDS = new Set(["List", "NeList"]);

function toAssoc(token: string): Assoc {
  switch (token) {
    case Assoc.LEFT:
      return Assoc.LEFT;
    case Assoc.RIGHT:
      return Assoc.RIGHT;
    case Assoc.NON_ASSOC:
      return Assoc.NON_ASSOC;
    default:
      throw new Error(`Unknown assoc type: ${token}`);
  }
}

export class OuterParser {
  private lexer: Iterator<Token>;
  private la: Token;
  private la2: Token;
  private source: string | null;

  constructor(text: Iterable<string>, source?: string) {
    this.lexer = outerLexer(text);
    this.la = this.lexer.next().value || EOF_TOKEN;
    this.la2 = this.lexer.next().value || EOF_TOKEN;
    this.source = source || null;
  }

  private consume(): string {
    const res = this.la.text;
    this.la = this.la2;
    const next = this.lexer.next();
    this.la2 = next.value || EOF_TOKEN;
    return res;
  }

  private errorLocationString(t: Token): string {
    if (!this.source) {
      return "";
    }
    return `${this.source}:${t.loc.line}:${t.loc.col}: `;
  }

  private unexpectedToken(
    token: Token,
    expectedTypes: TokenType[] = []
  ): Error {
    const location = this.source
      ? `${this.source}:${token.loc.line}:${token.loc.col}: `
      : "";
    let message = `Unexpected token: ${TokenType[token.type]}`;

    if (expectedTypes.length > 0) {
      const expected = expectedTypes
        .map((t) => TokenType[t])
        .sort()
        .join(", ");
      message = `Expected ${expected}, got: ${TokenType[token.type]}`;
    }

    return new Error(`${location}${message}`);
  }

  private match(tokenType: TokenType): string {
    if (this.la.type !== tokenType) {
      throw this.unexpectedToken(this.la, [tokenType]);
    }
    const res = this.la.text;
    this.la = this.la2;
    const next = this.lexer.next();
    this.la2 = next.value || EOF_TOKEN;
    return res;
  }

  private matchAny(tokenTypes: Set<TokenType>): string {
    if (!tokenTypes.has(this.la.type)) {
      throw this.unexpectedToken(this.la, Array.from(tokenTypes));
    }
    const res = this.la.text;
    this.la = this.la2;
    const next = this.lexer.next();
    this.la2 = next.value || EOF_TOKEN;
    return res;
  }

  definition(): Definition {
    const requires: Require[] = [];
    while (this.la.type === TokenType.KW_REQUIRES) {
      requires.push(this.require());
    }

    const modules: Module[] = [];
    while (this.la.type === TokenType.KW_MODULE) {
      modules.push(this.module());
    }

    return new Definition(modules, requires);
  }

  require(): Require {
    this.match(TokenType.KW_REQUIRES);
    const path = dequoteString(this.match(TokenType.STRING));
    return new Require(path);
  }

  module(): Module {
    const beginLoc = this.la.loc;

    this.match(TokenType.KW_MODULE);

    const name = this.match(TokenType.MODNAME);
    const att = this.maybeAtt();

    const imports: Import[] = [];
    while (this.la.type === TokenType.KW_IMPORTS) {
      imports.push(this.import());
    }

    const sentences: Sentence[] = [];
    while (this.la.type !== TokenType.KW_ENDMODULE) {
      sentences.push(this.sentence());
    }

    const endLoc = this.la.loc.add(this.la.text);
    this.consume();

    return new Module(name, sentences, imports, att, this.source, [
      beginLoc.line,
      beginLoc.col,
      endLoc.line,
      endLoc.col,
    ]);
  }

  import(): Import {
    this.match(TokenType.KW_IMPORTS);

    let isPublic = true;
    if (this.la.type === TokenType.KW_PRIVATE) {
      isPublic = false;
      this.consume();
    } else if (this.la.type === TokenType.KW_PUBLIC) {
      this.consume();
    }

    const moduleName = this.match(TokenType.MODNAME);

    return new Import(moduleName, isPublic);
  }

  sentence(): Sentence {
    if (this.la.type === TokenType.KW_SYNTAX) {
      return this.syntaxSentence();
    }

    return this.stringSentence();
  }

  syntaxSentence(): SyntaxSentence {
    this.match(TokenType.KW_SYNTAX);

    if (SORT_DECL_TOKENS.has(this.la.type)) {
      const decl = this.sortDecl();

      if (this.la.type === TokenType.EQ) {
        this.consume();
        const sort = this.sort();
        const att = this.maybeAtt();
        return new SyntaxSynonym(decl, sort, att);
      }

      if (this.la.type === TokenType.DCOLONEQ) {
        this.consume();
        const blocks: PriorityBlock[] = [];
        blocks.push(this.priorityBlock());
        // @ts-ignore
        while (this.la.type === TokenType.GT) {
          this.consume();
          blocks.push(this.priorityBlock());
        }
        return new SyntaxDefn(decl, blocks);
      }

      const att = this.maybeAtt();
      return new SyntaxDecl(decl, att);
    }

    if (this.la.type === TokenType.KW_PRIORITY) {
      this.consume();
      const groups: string[][] = [];
      let group: string[] = [];
      group.push(this.match(TokenType.KLABEL));
      // @ts-ignore
      while (this.la.type === TokenType.KLABEL) {
        group.push(this.consume());
      }
      groups.push(group);
      // @ts-ignore
      while (this.la.type === TokenType.GT) {
        this.consume();
        group = [];
        group.push(this.match(TokenType.KLABEL));
        while (this.la.type === TokenType.KLABEL) {
          group.push(this.consume());
        }
        groups.push(group);
      }
      return new SyntaxPriority(groups);
    }

    if (ASSOC_TOKENS.has(this.la.type)) {
      const assoc = toAssoc(this.consume());
      const klabels: string[] = [];
      klabels.push(this.match(TokenType.KLABEL));
      while (this.la.type === TokenType.KLABEL) {
        klabels.push(this.consume());
      }
      return new SyntaxAssoc(assoc, klabels);
    }

    if (this.la.type === TokenType.KW_LEXICAL) {
      this.consume();
      const name = this.match(TokenType.ID_UPPER);
      this.match(TokenType.EQ);
      const regex = dequoteRegex(this.match(TokenType.REGEX));
      return new SyntaxLexical(name, regex);
    }

    throw this.unexpectedToken(this.la);
  }

  private sortDecl(): SortDecl {
    const params: string[] = [];
    if (this.la.type === TokenType.LBRACE) {
      this.consume();
      params.push(this.match(TokenType.ID_UPPER));
      // @ts-ignore
      while (this.la.type === TokenType.COMMA) {
        this.consume();
        params.push(this.match(TokenType.ID_UPPER));
      }
      this.match(TokenType.RBRACE);
    }

    const name = this.match(TokenType.ID_UPPER);

    const args: string[] = [];
    if (this.la.type === TokenType.LBRACE) {
      this.consume();
      args.push(this.match(TokenType.ID_UPPER));
      // @ts-ignore
      while (this.la.type === TokenType.COMMA) {
        this.consume();
        args.push(this.match(TokenType.ID_UPPER));
      }
      this.match(TokenType.RBRACE);
    }

    return new SortDecl(name, params, args);
  }

  private sort(): Sort {
    const name = this.match(TokenType.ID_UPPER);

    const args: (number | string)[] = [];
    if (this.la.type === TokenType.LBRACE) {
      this.consume();
      // @ts-ignore
      if (this.la.type === TokenType.NAT) {
        args.push(parseInt(this.consume(), 10));
      } else {
        args.push(this.match(TokenType.ID_UPPER));
      }
      // @ts-ignore
      while (this.la.type === TokenType.COMMA) {
        this.consume();
        if (this.la.type === TokenType.NAT) {
          args.push(parseInt(this.consume(), 10));
        } else {
          args.push(this.match(TokenType.ID_UPPER));
        }
      }

      this.match(TokenType.RBRACE);
    }

    return new Sort(name, args);
  }

  private priorityBlock(): PriorityBlock {
    let assoc: Assoc | null = null;
    if (ASSOC_TOKENS.has(this.la.type)) {
      assoc = toAssoc(this.consume());
      this.match(TokenType.COLON);
    }

    const productions: ProductionLike[] = [];
    productions.push(this.productionLike());
    while (this.la.type === TokenType.VBAR) {
      this.consume();
      productions.push(this.productionLike());
    }
    return new PriorityBlock(productions, assoc);
  }

  private productionLike(): ProductionLike {
    if (
      this.la2.type === TokenType.LBRACE &&
      this.la.type === TokenType.ID_UPPER &&
      USER_LIST_IDS.has(this.la.text)
    ) {
      const nonEmpty = this.la.text[0] === "N";
      this.consume();
      this.consume();
      const sort = this.match(TokenType.ID_UPPER);
      this.match(TokenType.COMMA);
      const sep = dequoteString(this.match(TokenType.STRING));
      this.match(TokenType.RBRACE);
      const att = this.maybeAtt();
      return new UserList(sort, sep, nonEmpty, att);
    }

    const items: ProductionItem[] = [];

    if (this.la2.type === TokenType.LPAREN) {
      items.push(new Terminal(this.matchAny(ID_TOKENS)));
      items.push(new Terminal(this.consume()));
      while (this.la.type !== TokenType.RPAREN) {
        items.push(this.nonTerminal());
        if (this.la.type === TokenType.COMMA) {
          items.push(new Terminal(this.consume()));
          continue;
        }
        break;
      }
      items.push(new Terminal(this.match(TokenType.RPAREN)));
    } else {
      items.push(this.productionItem());
      while (PRODUCTION_ITEM_TOKENS.has(this.la.type)) {
        items.push(this.productionItem());
      }
    }

    const att = this.maybeAtt();
    return new Production(items, att);
  }

  private productionItem(): ProductionItem {
    if (this.la.type === TokenType.STRING) {
      return new Terminal(dequoteString(this.consume()));
    }

    if (this.la.type === TokenType.REGEX) {
      return new Lexical(dequoteRegex(this.consume()));
    }

    return this.nonTerminal();
  }

  private nonTerminal(): NonTerminal {
    let name: string;
    if (
      this.la.type === TokenType.ID_LOWER ||
      this.la2.type === TokenType.COLON
    ) {
      name = this.matchAny(ID_TOKENS);
      this.match(TokenType.COLON);
    } else {
      name = "";
    }

    const sort = this.sort();
    return new NonTerminal(sort, name);
  }

  stringSentence(): StringSentence {
    let clsKey = this.la.type;

    if (this.la.type === TokenType.KW_CONTEXT) {
      this.consume();
      // @ts-ignore
      if (this.la.type === TokenType.KW_ALIAS) {
        clsKey = this.la.type;
        this.consume();
      }
    } else {
      this.matchAny(SIMPLE_BUBBLE_TOKENS);
    }

    const cls = STRING_SENTENCE[clsKey]!;

    let label: string;
    if (this.la.type === TokenType.LBRACK) {
      this.consume();
      label = this.match(TokenType.RULE_LABEL);
      this.match(TokenType.RBRACK);
      this.match(TokenType.COLON);
    } else {
      label = "";
    }

    const bubble = this.match(TokenType.BUBBLE);
    const att = this.maybeAtt();
    return new cls(bubble, label, att);
  }

  private maybeAtt(): Att {
    const items: Array<[string, string]> = [];

    if (this.la.type !== TokenType.LBRACK) {
      return EMPTY_ATT;
    }

    this.consume();

    while (true) {
      const key = this.match(TokenType.ATTR_KEY);

      let value: string;

      // @ts-ignore
      if (this.la.type === TokenType.LPAREN) {
        this.consume();
        switch (this.la.type) {
          case TokenType.ATTR_CONTENT:
            value = this.consume();
            break;
          case TokenType.STRING:
            value = dequoteString(this.consume());
            break;
          default:
            value = "";
        }
        this.match(TokenType.RPAREN);
      } else {
        value = "";
      }

      items.push([key, value]);

      // @ts-ignore
      if (this.la.type !== TokenType.COMMA) {
        break;
      } else {
        this.consume();
      }
    }

    this.match(TokenType.RBRACK);

    return new Att(items);
  }
}

function dequoteString(s: string): string {
  return deQuoteString(s.slice(1, -1));
}

function dequoteRegex(s: string): string {
  return deQuoteString(s.slice(2, -1));
}
