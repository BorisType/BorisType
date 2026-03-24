/**
 * Compilation Pipeline
 *
 * Координирует процесс компиляции TypeScript → IR → BorisScript
 *
 * @module pipeline
 */

import * as ts from "typescript";
import * as fs from "node:fs";
import * as path from "node:path";
import { transformToIR } from "../lowering/index.ts";
import { emit, type EmitOptions } from "../emitter/index.ts";
import { analyzeScopes, printScopeTree } from "../analyzer/index.ts";
import type { IRProgram } from "../ir/index.ts";
import { runPasses, type PassContext } from "../passes/index.ts";
import { tryFinallyDesugarPass } from "../passes/try-finally-desugar.ts";
import { parenthesizePass } from "../passes/parenthesize.ts";
import { cleanupGroupingPass } from "../passes/cleanup-grouping.ts";
import { commaSafetyPass } from "../passes/comma-safety.ts";
import { literalExtractPass } from "../passes/literal-extract.ts";
import { hoistPass } from "../passes/hoist.ts";
import { createBtDiagnosticMessage, BtDiagnosticCode } from "./diagnostics.ts";

/** Режим транспиляции: bare | script | module */
export type CompileMode = "bare" | "script" | "module";

/**
 * Опции компиляции
 */
export interface CompileOptions {
  /** Режим транспиляции (default: module) */
  mode?: CompileMode;
  /** Имя файла (для диагностики) */
  filename?: string;
  /** Путь выходного файла (для compileSourceFile; иначе вычисляется из filename) */
  outputPath?: string;
  /** Ключ файла для script mode: packageName+version+relativePath (import.meta, bt.getFileUrl) */
  fileKey?: string;
  /** Имя текущего .js файла для module mode (только basename, для AbsoluteUrl) */
  currentFileJs?: string;
  /** Опции TypeScript */
  tsCompilerOptions?: ts.CompilerOptions;
  /** Опции emit */
  emitOptions?: EmitOptions;
  /** Выводить IR в консоль */
  debugIR?: boolean;
  /** Выводить scope tree в консоль */
  debugScopes?: boolean;
}

/** Один выходной файл */
export interface CompileOutput {
  /** Путь к файлу (относительный или абсолютный) */
  path: string;
  /** Сгенерированный код */
  code: string;
  /** Source map (если есть) */
  map?: string;
}

/**
 * Результат компиляции
 */
export interface CompileResult {
  /** Успешность компиляции */
  success: boolean;
  /** Выходные файлы (пока всегда 1 элемент) */
  outputs: CompileOutput[];
  /** IR (если debug) */
  ir?: IRProgram;
  /** Диагностики компиляции (TS + bt-ir) */
  diagnostics: ts.Diagnostic[];
}

/**
 * Компилирует TypeScript код в BorisScript
 *
 * @param sourceCode - Исходный код TypeScript
 * @param options - Опции компиляции
 * @returns Результат компиляции
 */
export function compile(sourceCode: string, options: CompileOptions = {}): CompileResult {
  const filename = options.filename ?? "input.ts";
  const allDiagnostics: ts.Diagnostic[] = [];

  // Создаём TypeScript Program
  const tsOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    strict: true,
    noEmit: true,
    ...options.tsCompilerOptions,
  };

  // Создаём виртуальный CompilerHost
  const host = createVirtualCompilerHost(filename, sourceCode, tsOptions);
  const program = ts.createProgram([filename], tsOptions, host);
  const sourceFile = program.getSourceFile(filename);
  const typeChecker = program.getTypeChecker();

  if (!sourceFile) {
    return {
      success: false,
      outputs: [],
      diagnostics: [
        createBtDiagnosticMessage(
          "Failed to parse source file",
          ts.DiagnosticCategory.Error,
          BtDiagnosticCode.TransformFailed,
        ),
      ],
    };
  }

  // Собираем TypeScript диагностики (фильтруем node_modules)
  const tsDiagnostics = ts.getPreEmitDiagnostics(program);
  for (const diag of tsDiagnostics) {
    if (diag.file?.fileName.includes("node_modules")) continue;
    allDiagnostics.push(diag);
  }

  // Анализируем scopes
  const scopeAnalysis = analyzeScopes(sourceFile);

  if (options.debugScopes) {
    console.log("\n=== Scope Tree ===");
    printScopeTree(scopeAnalysis.moduleScope);
    if (scopeAnalysis.capturedVariables.length > 0) {
      console.log("\n=== Captured Variables ===");
      for (const v of scopeAnalysis.capturedVariables) {
        console.log(
          `  ${v.name} (declared in ${v.declarationScope.name || v.declarationScope.type})`,
        );
      }
    }
  }

  const mode = options.mode ?? "module";

  let ir: IRProgram;
  try {
    const transformResult = transformToIR(sourceFile, typeChecker, scopeAnalysis, {
      mode,
      fileKey: options.fileKey,
      currentFileJs: options.currentFileJs,
    });
    ir = transformResult.ir;
    allDiagnostics.push(...transformResult.diagnostics);
  } catch (e) {
    allDiagnostics.push(
      createBtDiagnosticMessage(
        `IR transformation failed: ${e instanceof Error ? e.message : e}`,
        ts.DiagnosticCategory.Error,
        BtDiagnosticCode.TransformFailed,
      ),
    );
    return {
      success: false,
      outputs: [],
      diagnostics: allDiagnostics,
    };
  }

  if (options.debugIR) {
    console.log("\n=== IR ===");
    console.log(JSON.stringify(ir, null, 2));
  }

  const passCtx: PassContext = { diagnostics: allDiagnostics, sourceFile };

  try {
    ir = runPasses(
      ir,
      [
        tryFinallyDesugarPass,
        parenthesizePass,
        commaSafetyPass,
        cleanupGroupingPass,
        literalExtractPass,
        hoistPass,
      ],
      passCtx,
    );
  } catch (e) {
    allDiagnostics.push(
      createBtDiagnosticMessage(
        `${e instanceof Error ? e.message : e}`,
        ts.DiagnosticCategory.Error,
        BtDiagnosticCode.PassFailed,
      ),
    );
    return { success: false, outputs: [], diagnostics: allDiagnostics };
  }

  if (allDiagnostics.some((d) => d.category === ts.DiagnosticCategory.Error)) {
    return { success: false, outputs: [], diagnostics: allDiagnostics };
  }

  let result;
  try {
    result = emit(ir, options.emitOptions);
  } catch (e) {
    allDiagnostics.push(
      createBtDiagnosticMessage(
        `Emit failed: ${e instanceof Error ? e.message : e}`,
        ts.DiagnosticCategory.Error,
        BtDiagnosticCode.EmitFailed,
      ),
    );
    return { success: false, outputs: [], diagnostics: allDiagnostics };
  }

  const outputPath = options.filename ? options.filename.replace(/\.tsx?$/, ".js") : "output.js";

  const hasErrors = allDiagnostics.some((d) => d.category === ts.DiagnosticCategory.Error);

  return {
    success: !hasErrors,
    outputs: [
      {
        path: outputPath,
        code: result.code,
        map: result.map,
      },
    ],
    ir: options.debugIR ? ir : undefined,
    diagnostics: allDiagnostics,
  };
}

/**
 * Компилирует файл TypeScript в BorisScript
 *
 * @param filePath - Путь к TypeScript файлу
 * @param options - Опции компиляции
 * @returns Результат компиляции
 */
export function compileFile(filePath: string, options: CompileOptions = {}): CompileResult {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      outputs: [],
      diagnostics: [
        createBtDiagnosticMessage(
          `File not found: ${absolutePath}`,
          ts.DiagnosticCategory.Error,
          BtDiagnosticCode.TransformFailed,
        ),
      ],
    };
  }

  const sourceCode = fs.readFileSync(absolutePath, "utf-8");

  return compile(sourceCode, {
    ...options,
    filename: absolutePath,
  });
}

/**
 * Компилирует SourceFile из существующего Program (для интеграции с btc).
 * Не создаёт Program — использует переданный для type checker и зависимостей.
 *
 * @param sourceFile - TypeScript SourceFile для компиляции
 * @param program - Существующий TypeScript Program (с noEmit для диагностики)
 * @param options - Опции компиляции
 * @returns Результат компиляции
 */
export function compileSourceFile(
  sourceFile: ts.SourceFile,
  program: ts.Program,
  options: CompileOptions = {},
): CompileResult {
  const typeChecker = program.getTypeChecker();
  const allDiagnostics: ts.Diagnostic[] = [];

  // TS диагностика НЕ собирается здесь — btc собирает её отдельно через ts.getPreEmitDiagnostics.
  // Здесь собираем только bt-ir диагностики (lowering, passes, emit).

  const scopeAnalysis = analyzeScopes(sourceFile);

  if (options.debugScopes) {
    console.log("\n=== Scope Tree ===");
    printScopeTree(scopeAnalysis.moduleScope);
  }

  const mode = options.mode ?? "module";

  let ir: IRProgram;
  try {
    const transformResult = transformToIR(sourceFile, typeChecker, scopeAnalysis, {
      mode,
      fileKey: options.fileKey,
      currentFileJs: options.currentFileJs,
    });
    ir = transformResult.ir;
    allDiagnostics.push(...transformResult.diagnostics);
  } catch (e) {
    allDiagnostics.push(
      createBtDiagnosticMessage(
        `IR transformation failed: ${e instanceof Error ? e.message : e}`,
        ts.DiagnosticCategory.Error,
        BtDiagnosticCode.TransformFailed,
      ),
    );
    return {
      success: false,
      outputs: [],
      diagnostics: allDiagnostics,
    };
  }

  if (options.debugIR) {
    console.log("\n=== IR ===");
    console.log(JSON.stringify(ir, null, 2));
  }

  const passCtx: PassContext = { diagnostics: allDiagnostics, sourceFile };

  try {
    ir = runPasses(
      ir,
      [
        tryFinallyDesugarPass,
        parenthesizePass,
        commaSafetyPass,
        cleanupGroupingPass,
        literalExtractPass,
        hoistPass,
      ],
      passCtx,
    );
  } catch (e) {
    allDiagnostics.push(
      createBtDiagnosticMessage(
        `${e instanceof Error ? e.message : e}`,
        ts.DiagnosticCategory.Error,
        BtDiagnosticCode.PassFailed,
      ),
    );
    return { success: false, outputs: [], diagnostics: allDiagnostics };
  }

  if (allDiagnostics.some((d) => d.category === ts.DiagnosticCategory.Error)) {
    return { success: false, outputs: [], diagnostics: allDiagnostics };
  }

  let result;
  try {
    result = emit(ir, options.emitOptions);
  } catch (e) {
    allDiagnostics.push(
      createBtDiagnosticMessage(
        `Emit failed: ${e instanceof Error ? e.message : e}`,
        ts.DiagnosticCategory.Error,
        BtDiagnosticCode.EmitFailed,
      ),
    );
    return { success: false, outputs: [], diagnostics: allDiagnostics };
  }

  const outputPath =
    options.outputPath ?? (options.filename ?? sourceFile.fileName).replace(/\.tsx?$/, ".js");

  const hasErrors = allDiagnostics.some((d) => d.category === ts.DiagnosticCategory.Error);

  return {
    success: !hasErrors,
    outputs: [
      {
        path: outputPath,
        code: result.code,
        map: result.map,
      },
    ],
    ir: options.debugIR ? ir : undefined,
    diagnostics: allDiagnostics,
  };
}

/**
 * Создаёт виртуальный CompilerHost для компиляции строки
 */
function createVirtualCompilerHost(
  filename: string,
  content: string,
  options: ts.CompilerOptions,
): ts.CompilerHost {
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile;
  const originalFileExists = host.fileExists;
  const originalReadFile = host.readFile;

  host.getSourceFile = (name, languageVersion, onError) => {
    if (name === filename) {
      return ts.createSourceFile(name, content, languageVersion, true);
    }
    return originalGetSourceFile.call(host, name, languageVersion, onError);
  };

  host.fileExists = (name) => {
    if (name === filename) return true;
    return originalFileExists.call(host, name);
  };

  host.readFile = (name) => {
    if (name === filename) return content;
    return originalReadFile.call(host, name);
  };

  return host;
}
