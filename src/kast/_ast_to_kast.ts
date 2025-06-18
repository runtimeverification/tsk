import { Atts, EMPTY_ATT, KAtt } from "./att";
import type { KAst } from "./kast";
import {
  KDefinition,
  KFlatModule,
  KImport,
  KRequire,
  KSentence,
} from "./outer";
import {
  AST,
  Att,
  Definition,
  Import,
  Module,
  Require,
  Sentence,
} from "./outer_syntax";

// Function overloads for astToKast
export function astToKast(ast: Definition, mainModule: string): KDefinition;
export function astToKast(ast: Module): KFlatModule;
export function astToKast(ast: Import): KImport;
export function astToKast(ast: Require): KRequire;
export function astToKast(ast: Att): KAtt;
export function astToKast(ast: Sentence): KSentence;
export function astToKast(ast: AST, ...args: any[]): KAst;

// Main implementation
export function astToKast(ast: AST, ...args: any[]): KAst {
  if (ast instanceof Definition) {
    const mainModule = args[0] as string;
    return definitionToKDefinition(ast, mainModule);
  }

  if (ast instanceof Module) {
    return moduleToKFlatModule(ast);
  }

  if (ast instanceof Import) {
    return importToKImport(ast);
  }

  if (ast instanceof Require) {
    return requireToKRequire(ast);
  }

  if (ast instanceof Att) {
    return attToKAtt(ast);
  }

  if (isSentence(ast)) {
    return sentenceToKSentence(ast);
  }

  throw new Error(`Unimplemented AST->KAst conversion for: ${ast}`);
}

function definitionToKDefinition(
  d: Definition,
  mainModule: string
): KDefinition {
  const modules = d.modules.map((m) => moduleToKFlatModule(m));
  const requires = d.requires.map((r) => requireToKRequire(r));
  return new KDefinition(mainModule, modules, requires);
}

function moduleToKFlatModule(m: Module): KFlatModule {
  const sentences = m.sentences.map((s) => sentenceToKSentence(s));
  const imports = m.imports.map((i) => importToKImport(i));
  let att = attToKAtt(m.att);

  if (m.location && !att.get(Atts.LOCATION)) {
    att = att.update([Atts.LOCATION.call(m.location as any)]);
  }

  if (m.source && !att.get(Atts.SOURCE)) {
    att = att.update([Atts.SOURCE.call(m.source)]);
  }

  return new KFlatModule(m.name, sentences, imports, att);
}

function importToKImport(i: Import): KImport {
  return new KImport(i.moduleName, i.isPublic);
}

function requireToKRequire(r: Require): KRequire {
  return new KRequire(r.path);
}

function attToKAtt(att: Att): KAtt {
  if (att.items.length === 0) {
    return EMPTY_ATT;
  }

  const attMap = new Map(att.items);
  return KAtt.parse(attMap);
}

function sentenceToKSentence(s: Sentence): KSentence {
  throw new Error(
    `Unimplemented Sentence->KSentence conversion for: ${s.constructor.name}`
  );
}

// Type guard function to check if AST is a Sentence
function isSentence(ast: AST): ast is Sentence {
  return ast instanceof Sentence;
}
