/**
 * Определение режима транспиляции для файла
 *
 * @module build/compile-mode
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { BtcCompileOptions, CompileMode } from "./types.js";
import type { ExecutableObjectSourceFileInfo } from "./types.js";

const EXECUTABLE_OBJECTS = new Set([
  "remoteAction",
  "remoteCollection",
  "systemEventHandler",
  "serverAgent",
  "codeLibrary",
  "statisticRec",
]);

const BT_MODE_DIRECTIVE = /\/\/\/\s*@bt-mode\s+(bare|script|module)/;

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
 * Ищет директиву /// @bt-mode в начале файла
 */
function getDirectiveMode(sourceFile: ts.SourceFile): CompileMode | null {
  const text = sourceFile.getFullText();
  const firstLines = text.split("\n").slice(0, 30).join("\n");
  const match = firstLines.match(BT_MODE_DIRECTIVE);
  return match ? (match[1] as CompileMode) : null;
}

/**
 * Вычисляет compileMode из usePolyfill/useRemodule (обратная совместимость)
 */
function getCompileModeFromOptions(options: BtcCompileOptions): CompileMode {
  if (options.compileMode) {
    return options.compileMode;
  }
  return "module";
}

/**
 * Определяет режим транспиляции для конкретного файла
 *
 * Приоритет: директива > .test.ts/executable → script > options.compileMode
 */
export function resolveCompileMode(sourceFile: ts.SourceFile, options: BtcCompileOptions, executablePaths?: Set<string>): CompileMode {
  const directive = getDirectiveMode(sourceFile);
  if (directive) {
    return directive;
  }
  if (sourceFile.fileName.endsWith(".test.ts")) {
    return "script";
  }
  if (executablePaths?.has(sourceFile.fileName) ?? hasExecutableObjectImports(sourceFile)) {
    return "script";
  }
  return getCompileModeFromOptions(options);
}

/**
 * Собирает список executable objects из исходных файлов
 */
export function collectExecutables(
  program: ts.Program,
  sourceFiles: ts.SourceFile[],
): { executables: ExecutableObjectSourceFileInfo[]; paths: Set<string> } {
  const paths = new Set<string>();
  const executables: ExecutableObjectSourceFileInfo[] = [];
  const packageJson = getPackageJson(program);

  if (!packageJson) {
    return { executables, paths };
  }

  for (const sf of sourceFiles) {
    if (hasExecutableObjectImports(sf)) {
      paths.add(sf.fileName);
      executables.push({
        packageName: packageJson.name,
        packageVersion: packageJson.version,
        filePath: sf.fileName,
      });
    }
  }
  return { executables, paths };
}

function getPackageJson(program: ts.Program): { name: string; version: string; root: string } | null {
  let root = program.getCurrentDirectory();
  while (root !== path.dirname(root)) {
    const p = path.join(root, "package.json");
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, "utf-8"));
      return {
        name: j.name ?? "unknown",
        version: j.version ?? "0.0.0",
        root,
      };
    }
    root = path.dirname(root);
  }
  return null;
}

/**
 * Вычисляет fileKey для script mode: packageName+version+relativePath
 * Используется для import.meta и bt.getFileUrl
 */
export function computeFileKey(sourceFile: ts.SourceFile, program: ts.Program): string | undefined {
  const pkg = getPackageJson(program);
  if (!pkg) return undefined;
  const rel = path.relative(pkg.root, sourceFile.fileName).replace(/\\/g, "/");
  return `${pkg.name}+${pkg.version}+${rel}`;
}

/**
 * Вычисляет имя текущего .js файла для module mode (только basename).
 * AbsoluteUrl уже знает директорию, нужен только filename.
 */
export function computeCurrentFileJs(sourceFile: ts.SourceFile): string {
  return path.basename(sourceFile.fileName).replace(/\.tsx?$/, ".js");
}
