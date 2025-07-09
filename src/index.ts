// K Framework JavaScript/TypeScript Library
// Main entry point for the package

export * from "./cterm";
export * from "./kast";
export {
  createFrozenRecord,
  deepConvert,
  filterNone,
  frozenRecord,
  isFrozenRecord,
  mergeWith,
} from "./utils";
export type { FrozenRecord } from "./utils";
