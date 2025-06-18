import { deQuoteString, enQuoteString } from "../../dequote";
import { KSort, KToken } from "../inner";

export const STRING = new KSort("String");

export function stringToken(pretty: string): KToken {
  return new KToken(`"${enQuoteString(pretty)}"`, STRING);
}

export function prettyString(token: KToken): string {
  if (!token.sort.name || token.sort.name !== STRING.name) {
    throw new Error(`Expected String token, got: ${token}`);
  }

  if (!token.token.startsWith('"') || !token.token.endsWith('"')) {
    throw new Error(`Invalid string token format: ${token.token}`);
  }

  return deQuoteString(token.token.slice(1, -1));
}
