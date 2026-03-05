/**
 * TypeScript компилятор
 *
 * Отвечает за:
 * - Создание TypeScript program
 * - Диагностику через tsc
 * - Генерацию d.ts через tsc (emitDeclarationOnly + noEmitOnError)
 * - Emit JS через bt-ir (compileSourceFile)
 * - Пост-обработку через transformOutput
 *
 * @module build/compiler
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { compileSourceFile } from "@boristype/bt-ir";
import { logger } from "../logger.js";
import type { BtcCompileOptions } from "./types.js";
import type { BuildContext, BuildResult, ExecutableObjectSourceFileInfo } from "./types.js";
import { transformOutput } from "./output.js";
import {
  resolveCompileMode,
  collectExecutables,
  computeFileKey,
  computeCurrentFileJs,
} from "./compile-mode.js";

/**
 * Фильтрует список файлов по заданному списку
 * Если files пустой, возвращает все rawFileNames
 */
function selectFiles(rawFileNames: string[], files: string[]): string[] {
  if (files.length === 0) {
    return rawFileNames;
  }
  return rawFileNames.filter(x => files.includes(x));
}

/**
 * Получает директорию вывода из конфигурации program
 */
function getOutputDirectory(program: ts.Program): string {
  const options = program.getCompilerOptions();
  const outDir = options.outDir || '';
  
  // Если outDir уже абсолютный путь, используем его напрямую
  if (path.isAbsolute(outDir)) {
    return path.normalize(outDir);
  }
  
  return path.normalize(path.join(program.getCurrentDirectory(), outDir));
}

/**
 * Выводит диагностику TypeScript в лог
 */
function reportDiagnostics(diagnostics: readonly ts.Diagnostic[]): void {
  diagnostics.forEach(diagnostic => {
    if (diagnostic.file) {
      const { line, character } = ts.getLineAndCharacterOfPosition(
        diagnostic.file, 
        diagnostic.start!
      );
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      logger.error(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
    } else {
      logger.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }
  });
}

/**
 * Вычисляет путь выходного файла для sourceFile
 */
function getOutputPath(sourceFile: ts.SourceFile, program: ts.Program): string {
  const opts = program.getCompilerOptions();
  const cwd = program.getCurrentDirectory();
  const outDir = path.resolve(cwd, opts.outDir || ".");
  const rootDir = opts.rootDir ? path.resolve(cwd, opts.rootDir) : path.dirname(program.getRootFileNames()[0] || sourceFile.fileName);
  const rel = path.relative(rootDir, sourceFile.fileName);
  const outFile = rel.replace(/\.tsx?$/, ".js");
  return path.join(outDir, outFile);
}

/**
 * Формирует compiler options для tsc.
 *
 * - `noEmitOnError: true` — tsc не эмитит при ошибках
 * - Если `declaration` включён — `emitDeclarationOnly: true` (tsc генерирует только d.ts)
 * - Иначе — `noEmit: true` (tsc ничего не эмитит, только диагностика)
 */
function buildCompilerOptions(tsOptions: ts.CompilerOptions): ts.CompilerOptions {
  return {
    ...tsOptions,
    noEmitOnError: true,
    ...(tsOptions.declaration
      ? { emitDeclarationOnly: true }
      : { noEmit: true }),
  };
}

/**
 * Фильтрует source files: убирает declaration files и файлы из node_modules
 */
function filterUserSourceFiles(sourceFiles: readonly ts.SourceFile[]): ts.SourceFile[] {
  return sourceFiles.filter(
    (sf) => !sf.isDeclarationFile && !sf.fileName.includes("node_modules")
  );
}

/**
 * Эмитит исходные файлы через bt-ir
 *
 * @param sourceFiles - Файлы для компиляции
 * @param program - TypeScript program (для type info)
 * @param options - Опции btc
 * @param executablePaths - Пути исполняемых объектов
 * @returns Список путей к сгенерированным файлам
 */
function emitSourceFiles(
  sourceFiles: readonly ts.SourceFile[],
  program: ts.Program,
  options: BtcCompileOptions,
  executablePaths: Set<string>,
): string[] {
  const emittedFiles: string[] = [];

  for (const sourceFile of sourceFiles) {
    const mode = resolveCompileMode(sourceFile, options, executablePaths);
    const outputPath = getOutputPath(sourceFile, program);

    const result = compileSourceFile(sourceFile, program, {
      mode,
      outputPath,
      filename: sourceFile.fileName,
      fileKey: mode === "script" ? computeFileKey(sourceFile, program) : undefined,
      currentFileJs: mode === "module" ? computeCurrentFileJs(sourceFile) : undefined,
    });

    for (const output of result.outputs) {
      const { fileName: finalFileName, content } = transformOutput(output.path, output.code, options);
      const dir = path.dirname(finalFileName);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(finalFileName, content, "utf-8");
      emittedFiles.push(finalFileName);
    }
  }

  return emittedFiles;
}

/**
 * Компилирует TypeScript файлы.
 *
 * - Диагностика и d.ts генерация — через tsc (noEmitOnError + emitDeclarationOnly)
 * - JS генерация — через bt-ir (compileSourceFile)
 */
export function compile(context: BuildContext): BuildResult {
  const startTime = Date.now();
  const { tsConfig, options, files } = context;
  const fileNames = selectFiles(tsConfig.fileNames, files);

  const compilerOptions = buildCompilerOptions(tsConfig.options);
  const program = ts.createProgram(fileNames, compilerOptions);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  reportDiagnostics(diagnostics);

  const hasErrors = diagnostics.some((d) => d.category === ts.DiagnosticCategory.Error);

  const allSourceFiles = filterUserSourceFiles(program.getSourceFiles());
  const sourceFiles =
    fileNames.length === 0
      ? allSourceFiles
      : fileNames
          .map((fn) => program.getSourceFile(fn))
          .filter((sf): sf is ts.SourceFile => !!sf);

  const { executables, paths: executablePaths } = collectExecutables(program, sourceFiles);
  const outputDir = getOutputDirectory(program);

  // Emit JS через bt-ir
  const emittedFiles = emitSourceFiles(sourceFiles, program, options, executablePaths);

  fs.writeFileSync(
    path.join(outputDir, ".executables.json"),
    JSON.stringify(executables, null, 2),
    "utf-8"
  );

  // Emit d.ts через tsc (noEmitOnError предотвратит emit при ошибках)
  if (tsConfig.options.declaration) {
    program.emit();
  }

  const duration = Date.now() - startTime;

  return {
    success: !hasErrors,
    emitResult: { emitSkipped: false, diagnostics: [] },
    executables,
    diagnostics,
    duration,
    emittedFiles,
  };
}

/**
 * Создаёт watch program для инкрементальной компиляции
 *
 * - Диагностика и d.ts — через tsc watch (noEmitOnError + emitDeclarationOnly)
 * - JS — через bt-ir для affected файлов
 *
 * @param context - Контекст сборки
 * @param onRebuild - Callback при каждой пересборке
 * @returns Контроллер для остановки watch
 */
export function createWatchProgram(
  context: BuildContext,
  onRebuild?: (result: BuildResult) => void
): { close: () => void } {
  const { tsConfig, options, cwd } = context;

  const configPath = ts.findConfigFile(
    cwd || process.cwd(),
    ts.sys.fileExists,
    'tsconfig.json'
  );

  if (!configPath) {
    throw new Error('Could not find tsconfig.json');
  }

  let currentExecutables: ExecutableObjectSourceFileInfo[] = [];
  let currentEmittedFiles: string[] = [];
  let buildStartTime = Date.now();
  let hasErrors = false;

  const watchCompilerOptions = buildCompilerOptions(tsConfig.options);

  const host = ts.createWatchCompilerHost(
    configPath,
    watchCompilerOptions,
    ts.sys,
    ts.createEmitAndSemanticDiagnosticsBuilderProgram,
    (diagnostic) => {
      hasErrors = true;
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      if (diagnostic.file) {
        const { line, character } = ts.getLineAndCharacterOfPosition(
          diagnostic.file,
          diagnostic.start!
        );
        logger.error(`${diagnostic.file.fileName}:${line + 1}:${character + 1} - ${message}`);
      } else {
        logger.error(message);
      }
    },
    (diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

      // 6031 = "Starting compilation in watch mode..."
      // 6032 / 6193 = "File change detected. Starting incremental compilation..."
      // 6194 = "Found 0 errors. Watching for file changes."
      if (diagnostic.code === 6031 || diagnostic.code === 6032 || diagnostic.code === 6193) {
        buildStartTime = Date.now();
        hasErrors = false;
        currentEmittedFiles = [];
        logger.info(`🔄 ${message}`);
      } else if (diagnostic.code === 6194) {
        const duration = Date.now() - buildStartTime;

        const outputDir = tsConfig.options.outDir || cwd || process.cwd();
        fs.writeFileSync(
          path.join(outputDir, '.executables.json'),
          JSON.stringify(currentExecutables, null, 2),
          'utf-8'
        );

        if (onRebuild) {
          onRebuild({
            success: !hasErrors,
            emitResult: { emitSkipped: false, diagnostics: [] },
            executables: currentExecutables,
            diagnostics: [],
            duration,
            emittedFiles: currentEmittedFiles,
          });
        }

        logger.success(`✅ Build successful (${duration}ms)`);
      } else {
        logger.info(message);
      }
    }
  );

  const originalAfterProgramCreate = host.afterProgramCreate;
  let isFirstBuild = true;

  host.afterProgramCreate = (builderProgram) => {
    const program = builderProgram.getProgram();

    // Собираем affected files
    const affectedFiles: ts.SourceFile[] = [];
    let result;
    while ((result = builderProgram.getSemanticDiagnosticsOfNextAffectedFile())) {
      if (result.affected && ts.isSourceFile(result.affected as any)) {
        affectedFiles.push(result.affected as ts.SourceFile);
      }
    }

    // На первой сборке — все файлы, далее — только affected
    const filesToEmit = filterUserSourceFiles(
      isFirstBuild ? [...program.getSourceFiles()] : affectedFiles
    );
    isFirstBuild = false;

    if (filesToEmit.length === 0) {
      logger.info('No files to emit');
      if (originalAfterProgramCreate) {
        originalAfterProgramCreate(builderProgram);
      }
      return;
    }

    logger.info(
      `Emitting ${filesToEmit.length} file(s): ${filesToEmit.map((f) => path.basename(f.fileName)).join(", ")}`
    );

    const { executables, paths: executablePaths } = collectExecutables(program, filesToEmit);
    currentExecutables = executables;

    // Emit JS через bt-ir
    const emitted = emitSourceFiles(filesToEmit, program, options, executablePaths);
    currentEmittedFiles.push(...emitted);

    // d.ts emit обрабатывается tsc автоматически (emitDeclarationOnly + noEmitOnError)
    if (originalAfterProgramCreate) {
      originalAfterProgramCreate(builderProgram);
    }
  };

  const watchProgram = ts.createWatchProgram(host);

  return {
    close: () => watchProgram.close(),
  };
}

