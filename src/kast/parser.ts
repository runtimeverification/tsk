import { KApply, KInner, KLabel, KSequence, KToken, KVariable } from "./inner";
import { lexer, type Token, TokenType } from "./lexer";

const TT = TokenType;

export class KAstParser {
  private _it: Iterator<Token>;
  private _la: Token;

  constructor(text: Iterable<string>) {
    this._it = lexer(text);
    this._la = this._it.next().value!;
  }

  private _consume(): string {
    const text = this._la.text;
    this._la = this._it.next().value!;
    return text;
  }

  private _match(expected: TokenType): string {
    if (this._la.type !== expected) {
      throw this._unexpectedToken(this._la, [expected]);
    }
    const text = this._la.text;
    this._la = this._it.next().value!;
    return text;
  }

  private _unexpectedToken(token: Token, expected: TokenType[] = []): Error {
    const types = expected.sort();

    if (types.length === 0) {
      return new Error(`Unexpected token: ${token.text}`);
    }

    if (types.length === 1) {
      const typ = types[0]!;
      return new Error(`Unexpected token: ${token.text}. Expected: ${typ}`);
    }

    const typeStr = types.join(", ");
    return new Error(
      `Unexpected token: ${token.text}. Expected one of: ${typeStr}`
    );
  }

  eof(): boolean {
    return this._la.type === TT.EOF;
  }

  k(): KInner {
    if (this._la.type === TT.DOTK) {
      this._consume();
      return new KSequence();
    }

    const items = [this.kitem()];
    while (this._la.type === TT.KSEQ) {
      this._consume();
      items.push(this.kitem());
    }

    if (items.length > 1) {
      return new KSequence(items);
    }

    return items[0]!;
  }

  kitem(): KInner {
    switch (this._la.type) {
      case TT.VARIABLE: {
        const name = this._consume();
        let sort: string | undefined = undefined;
        // @ts-ignore
        if (this._la.type === TT.COLON) {
          this._consume();
          sort = this._match(TT.SORT);
        }
        return new KVariable(name, sort);
      }

      case TT.TOKEN: {
        this._consume();
        this._match(TT.LPAREN);
        const token = this._unquote(this._match(TT.STRING));
        this._match(TT.COMMA);
        const sort = this._unquote(this._match(TT.STRING));
        this._match(TT.RPAREN);
        return new KToken(token, sort);
      }

      case TT.ID:
      case TT.KLABEL: {
        const label = this.klabel();
        this._match(TT.LPAREN);
        const args = this.klist();
        this._match(TT.RPAREN);
        return new KApply(label, args);
      }

      default:
        throw this._unexpectedToken(this._la, [
          TT.VARIABLE,
          TT.TOKEN,
          TT.ID,
          TT.KLABEL,
        ]);
    }
  }

  klabel(): KLabel {
    switch (this._la.type) {
      case TT.ID:
        return new KLabel(this._consume());
      case TT.KLABEL:
        return new KLabel(this._unquote(this._consume()));
      default:
        throw this._unexpectedToken(this._la, [TT.ID, TT.KLABEL]);
    }
  }

  klist(): KInner[] {
    if (this._la.type === TT.DOTKLIST) {
      this._consume();
      return [];
    }

    const res = [this.k()];
    while (this._la.type === TT.COMMA) {
      this._consume();
      res.push(this.k());
    }
    return res;
  }

  private _unquote(s: string): string {
    // Remove surrounding quotes and handle escape sequences
    // This matches the Python behavior: for each \x sequence, return x
    const content = s.slice(1, -1);
    return content.replace(/\\(.)/g, (_, char) => char);
  }
}
