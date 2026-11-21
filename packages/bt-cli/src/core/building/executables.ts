import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { ExecutableObjectSourceFileInfo } from "./types.js";

const EXECUTABLE_OBJECTS = new Set([
  "remoteAction",
  "remoteCollection",
  "systemEventHandler",
  "serverAgent",
  "codeLibrary",
  "statisticRec",
]);

/**
 * Проверяет, содержит ли файл импорты executable objects из @boristype/types
 */
function hasExecutableObjectImports(sourceFile: ts.SourceFile): boolean {
  let found = false;
  function check(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (ts.isStringLiteral(spec) && spec.text.startsWith("@boristype/types")) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            if (EXECUTABLE_OBJECTS.has(el.name.text)) {
              found = true;
              return;
            }
          }
        }
      }
    }
    ts.forEachChild(node, check);
  }
  ts.forEachChild(sourceFile, check);
  return found;
}

/**
 * Собирает список executable objects из исходных файлов
 */
export function collectExecutables(program: ts.Program, sourceFiles: ts.SourceFile[]): ExecutableObjectSourceFileInfo[] {
  const executables: ExecutableObjectSourceFileInfo[] = [];
  const packageJson = getPackageJson(program);

  if (!packageJson) {
    return executables;
  }

  for (const sf of sourceFiles) {
    if (hasExecutableObjectImports(sf)) {
      executables.push({
        packageName: packageJson.name,
        packageVersion: packageJson.version,
        filePath: sf.fileName,
      });
    }
  }
  return executables;
}

function getPackageJson(program: ts.Program): { name: string; version: string } | null {
  let root = program.getCurrentDirectory();
  while (root !== path.dirname(root)) {
    const p = path.join(root, "package.json");
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, "utf-8"));
      return {
        name: j.name ?? "unknown",
        version: j.version ?? "0.0.0",
      };
    }
    root = path.dirname(root);
  }
  return null;
}
