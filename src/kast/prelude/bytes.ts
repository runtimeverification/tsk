import {
  bytesDecode,
  bytesEncode,
  deQuoteBytes,
  enQuoteBytes,
} from "../../dequote";
import { KSort, KToken } from "../inner";

export const BYTES = new KSort("Bytes");

export function bytesTokenFromStr(pretty: string): KToken {
  return new KToken(`b"${enQuoteBytes(pretty)}"`, BYTES);
}

export function bytesToken(b: Uint8Array): KToken {
  return bytesTokenFromStr(bytesDecode(b));
}

export function prettyBytesStr(token: KToken): string {
  if (!token.sort.name || token.sort.name !== BYTES.name) {
    throw new Error(`Expected Bytes token, got: ${token}`);
  }

  if (!token.token.startsWith('b"') || !token.token.endsWith('"')) {
    throw new Error(`Invalid bytes token format: ${token.token}`);
  }

  return deQuoteBytes(token.token.slice(2, -1));
}

export function prettyBytes(token: KToken): Uint8Array {
  return bytesEncode(prettyBytesStr(token));
}
