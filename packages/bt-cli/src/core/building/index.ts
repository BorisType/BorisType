/**
 * Build Pipeline
 *
 * Основной модуль сборки TypeScript в BorisScript.
 * Предоставляет unified API для single и watch режимов.
 *
 * @example
 * ```typescript
 * // Single build
 * const result = BuildPipeline.run({
 *   tsConfig: parsedConfig,
 *   options: btcOptions,
 * });
 *
 * // Watch mode (будущее)
 * const watcher = BuildPipeline.watch(config, {
 *   onRebuild: (result) => console.log('Rebuilt!', result.success),
 * });
 * watcher.close();
 * ```
 *
 * @module build
 */

import { logger } from "../logger.js";
import type { BuildContext, BuildResult, CreateContextOptions } from "./types.js";
import { createBuildContext } from "./types.js";
import { compile, createWatchProgram } from "./compiler.js";
import { copyNonTypescriptFiles, watchNonTypescriptFiles } from "./files.js";

// Re-exports
export { createBuildContext } from "./types.js";
export type {
  BuildContext,
  BuildResult,
  BuildMode,
  CreateContextOptions,
  ExecutableObjectSourceFileInfo,
  BtcCompileOptions,
  CompileMode,
  BtcConfiguration,
} from "./types.js";
export { transformOutput, stripControlChars, indentString, decodeUnicodeEscapes } from "./output.js";
export { compile } from "./compiler.js";
export { collectNonTypescriptFiles, copyNonTypescriptFiles } from "./files.js";

/**
 * Опции для watch режима
 */
export interface WatchOptions {
  /** Callback при каждой пересборке */
  onRebuild?: (result: BuildResult) => void;
  /** Callback при изменении non-TypeScript файла */
  onNonTsFileChange?: (filePath: string) => void;
  /** Callback при ошибке */
  onError?: (error: Error) => void;
}

/**
 * Контроллер watch режима
 */
export interface WatchController {
  /** Останавливает watch */
  close: () => void;
}

/**
 * Build Pipeline - единая точка входа для сборки
 */
export const BuildPipeline = {
  /**
   * Выполняет однократную сборку проекта
   *
   * @param contextOrOptions - Контекст сборки или опции для его создания
   * @returns Результат сборки
   */
  run(contextOrOptions: BuildContext | CreateContextOptions): BuildResult {
    const context: BuildContext =
      "mode" in contextOrOptions && contextOrOptions.mode !== undefined
        ? (contextOrOptions as BuildContext)
        : createBuildContext(contextOrOptions);

    logger.info(`🔨 ${new Date().toLocaleTimeString()} Build started`);

    // Компилируем TypeScript
    const result = compile(context);

    // Копируем non-TypeScript файлы
    copyNonTypescriptFiles(context);

    if (result.success) {
      logger.info(`✅ ${new Date().toLocaleTimeString()} Build finished (${result.duration}ms)`);
    } else {
      logger.error(`❌ ${new Date().toLocaleTimeString()} Build failed with errors`);
    }

    return result;
  },

  /**
   * Запускает watch режим для инкрементальной сборки
   *
   * @param contextOrOptions - Контекст сборки или опции для его создания
   * @param watchOptions - Опции watch режима
   * @returns Контроллер для остановки watch
   */
  watch(contextOrOptions: BuildContext | CreateContextOptions, watchOptions?: WatchOptions): WatchController {
    const context: BuildContext =
      "mode" in contextOrOptions && contextOrOptions.mode !== undefined
        ? (contextOrOptions as BuildContext)
        : createBuildContext({ ...contextOrOptions, mode: "watch" });

    logger.info(`👀 ${new Date().toLocaleTimeString()} Watch mode started`);

    // Копируем non-TS файлы один раз при старте watch
    // (при пересборке копирование не нужно - только watcher отслеживает изменения)
    copyNonTypescriptFiles(context);

    // Запускаем TypeScript watch для инкрементальной компиляции
    const tsWatcher = createWatchProgram(context, (result) => {
      logger.warning(`🔄 ${new Date().toLocaleTimeString()} Rebuild completed. Success: ${result.success}`);

      // Вызываем пользовательский callback
      watchOptions?.onRebuild?.(result);
    });

    // Запускаем chokidar watcher для non-TypeScript файлов
    const nonTsWatcher = watchNonTypescriptFiles(context, watchOptions?.onNonTsFileChange);

    return {
      close: () => {
        tsWatcher.close();
        nonTsWatcher.close();
      },
    };
  },
};

// Для обратной совместимости со старым API
export { BuildPipeline as default };
