import * as fs from "fs";
import * as path from "path";
import { astToKast } from "./_ast_to_kast.ts";
import { selectCodeBlocks } from "./markdown";
import { KDefinition } from "./outer";
import { OuterParser } from "./outer_parser";
import { Definition, Require } from "./outer_syntax";

export interface ParseOuterOptions {
  includeDirs?: Iterable<string>;
  mdSelector?: string;
  includeSource?: boolean;
}

export function parseOuter(
  definitionFile: string,
  mainModule: string,
  options: ParseOuterOptions = {}
): KDefinition {
  const { includeDirs = [], mdSelector = "k", includeSource = true } = options;

  const parsedFiles = slurpDefinitions(definitionFile, {
    includeDirs,
    mdSelector,
    includeSource,
  });

  const modules = Object.values(parsedFiles).flatMap(
    (definition) => definition.modules
  );
  const finalDefinition = astToKast(new Definition(modules), mainModule);

  if (!(finalDefinition instanceof KDefinition)) {
    throw new Error("Expected KDefinition from astToKast");
  }

  return finalDefinition;
}

export interface SlurpDefinitionsOptions {
  includeDirs?: Iterable<string>;
  mdSelector?: string | null;
  includeSource?: boolean;
}

export function slurpDefinitions(
  mainFile: string,
  options: SlurpDefinitionsOptions = {}
): Record<string, Definition> {
  const { includeDirs = [], mdSelector = "k", includeSource = true } = options;

  const mainFilePath = path.resolve(mainFile);
  const includeDirectories = Array.from(includeDirs, (dir) =>
    path.resolve(dir)
  );
  const selector = mdSelector || "k";

  const result: Record<string, Definition> = {};
  const pending: string[] = [mainFilePath];

  while (pending.length > 0) {
    const currentFile = pending.pop()!;

    if (currentFile in result) {
      continue;
    }

    const definition = parseFile(currentFile, selector, includeSource);
    const resolvedRequires = definition.requires.map((require) =>
      resolveRequire(require, currentFile, includeDirectories)
    );

    // Add requires in reverse order to maintain DFS behavior
    pending.push(...resolvedRequires.reverse());

    result[currentFile] = definition;
  }

  return result;
}

function parseFile(
  definitionFile: string,
  mdSelector: string,
  includeSource: boolean
): Definition {
  console.info(`Reading ${definitionFile}`);

  let text = fs.readFileSync(definitionFile, "utf8");

  if (path.extname(definitionFile) === ".md") {
    text = selectCodeBlocks(text, mdSelector);
  }

  const parser = new OuterParser(
    text,
    includeSource ? definitionFile : undefined
  );
  return parser.definition();
}

function resolveRequire(
  require: Require,
  definitionFile: string,
  includeDirs: string[]
): string {
  const tryDirs = [path.dirname(definitionFile), ...includeDirs];
  const tryFiles = tryDirs.map((dir) => path.join(dir, require.path));

  for (const file of tryFiles) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return path.resolve(file);
    }
  }

  throw new Error(
    `${require.path} not found. Searched paths: [${tryDirs
      .map((p) => `"${p}"`)
      .join(", ")}]`
  );
}
