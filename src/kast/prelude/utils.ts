import { KToken } from "../inner";
import { bytesToken } from "./bytes";
import { boolToken } from "./kbool";
import { intToken } from "./kint";
import { stringToken } from "./string";

export function token(x: boolean | number | string | Uint8Array): KToken {
  if (typeof x === "boolean") {
    return boolToken(x);
  }
  if (typeof x === "number") {
    return intToken(x);
  }
  if (typeof x === "string") {
    return stringToken(x);
  }
  if (x instanceof Uint8Array) {
    return bytesToken(x);
  }
  throw new Error(`Unsupported type for token: ${typeof x}`);
}
