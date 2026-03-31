/**
 * Работа с файлами для сборки
 *
 * Отвечает за:
 * - Сбор non-TypeScript файлов из проекта
 * - Копирование non-TypeScript файлов в output директорию
 * - Watch mode для non-TypeScript файлов
 *
 * @module build/files
 */

import fs from "node:fs";
import { dirname, normalize, relative, resolve, join } from "node:path";
import type ts from "typescript";
import chokidar from "chokidar";
import { logger } from "../logger.js";
import type { BuildContext } from "./types.js";

/**
 * Расширения TypeScript файлов (исключаются из копирования)
 */
const TS_EXTENSIONS = [".ts", ".tsx"];

/**
 * Проверяет, является ли путь вложенным в другой путь
 */
function isSubpath(parent: string, child: string): boolean {
  const normalizedParent = normalize(parent).replace(/\\/g, "/");
  const normalizedChild = normalize(child).replace(/\\/g, "/");
  return normalizedChild.startsWith(normalizedParent + "/");
}

/**
 * Определяет rootDir из конфигурации
 *
 * Если rootDir не указан явно, пытается вычислить из include паттернов
 * или использует директорию tsconfig.
 */
function inferRootDir(configuration: ts.ParsedCommandLine, configDir: string): string {
  // Явно указанный rootDir
  if (configuration.options.rootDir) {
    return resolve(configDir, configuration.options.rootDir);
  }

  // Пытаемся извлечь общий prefix из include паттернов
  const { include } = configuration.raw || {};
  if (include && include.length > 0) {
    // Берём первый паттерн и извлекаем базовую директорию
    const firstPattern = include[0] as string;
    const baseDir = firstPattern.split("*")[0].replace(/\/+$/, "") || ".";
    return resolve(configDir, baseDir);
  }

  // Fallback: директория tsconfig
  return configDir;
}

/**
 * Собирает список non-TypeScript файлов из rootDir
 *
 * Сканирует все файлы в rootDir, исключая:
 * - TypeScript файлы (.ts, .tsx)
 * - Файлы из exclude паттернов tsconfig
 * - outDir (если находится внутри rootDir)
 * - node_modules
 *
 * @param configuration - ParsedCommandLine от TypeScript
 * @param configDir - Директория где находится tsconfig (для resolve путей)
 * @returns Список абсолютных путей к non-TypeScript файлам
 */
export function collectNonTypescriptFiles(configuration: ts.ParsedCommandLine, configDir: string = process.cwd()): string[] {
  const { outDir } = configuration.options;

  if (outDir === undefined) {
    throw new Error("The outDir option is not set in the tsconfig.json file.");
  }

  // fs.globSync доступен только в Node.js 22+
  if (parseInt(process.versions.node.split(".")[0]) < 22) {
    throw new Error("Non-TypeScript files processing requires Node.js v22 or later");
  }

  const rootDir = inferRootDir(configuration, configDir);
  const absoluteOutDir = resolve(configDir, outDir);

  // Базовые исключения
  const ignore: string[] = ["**/node_modules/**"];

  // Добавляем exclude из tsconfig
  const { exclude } = configuration.raw || {};
  if (exclude) {
    for (const pattern of exclude) {
      ignore.push(pattern);
    }
  }

  // Исключаем outDir если он внутри rootDir
  if (isSubpath(rootDir, absoluteOutDir)) {
    const relativeOutDir = relative(rootDir, absoluteOutDir);
    ignore.push(`${relativeOutDir}/**`);
  }

  // Сканируем rootDir
  const pattern = join(rootDir, "**", "*").replace(/\\/g, "/");

  // Node.js fs.globSync возвращает string[], фильтруем вручную
  return (
    fs
      .globSync(pattern, {
        exclude: (fileName) => {
          // Проверяем ignore паттерны
          const relativePath = relative(rootDir, fileName).replace(/\\/g, "/");

          // Если путь выходит за пределы rootDir, пропускаем проверку
          // (fs.globSync может вызывать exclude для родительских директорий)
          if (relativePath.startsWith("..")) {
            return false;
          }

          return ignore.some((p) => {
            if (typeof p === "string") {
              // Простая проверка glob паттернов
              if (p.includes("**")) {
                // Для паттернов типа "**/node_modules/**" проверяем вхождение
                const innerPattern = p.replace(/\*\*/g, "").replace(/^\/+|\/+$/g, "");
                if (innerPattern) {
                  return relativePath.includes(innerPattern);
                }
                return false; // Паттерн только из ** - игнорируем
              }
              return relativePath === p || relativePath.startsWith(p + "/");
            }
            return false;
          });
        },
      })
      // Фильтруем директории
      .filter((f) => fs.statSync(f).isFile())
      // Фильтруем TypeScript файлы
      .filter((f) => !TS_EXTENSIONS.some((ext) => f.endsWith(ext)))
  );
}

/**
 * Фильтрует файлы по заданному списку
 */
function selectFiles(allFiles: string[], filterFiles: string[]): string[] {
  if (filterFiles.length === 0) {
    return allFiles;
  }
  return allFiles.filter((x) => filterFiles.includes(x));
}

/**
 * Копирует non-TypeScript файлы в output директорию
 *
 * Сохраняет структуру директорий относительно rootDir.
 *
 * @param context - Контекст сборки
 */
export function copyNonTypescriptFiles(context: BuildContext): void {
  const { tsConfig, options, files, cwd } = context;
  const configDir = cwd || process.cwd();

  logger.warning("📁 Copying non-TypeScript files...");
  if (options.includeNonTsFiles === false) {
    logger.warning("Non-TypeScript files copy is disabled");
    return;
  }

  const { outDir } = tsConfig.options;

  if (!outDir) {
    logger.warning("outDir not set, skipping non-TypeScript files copy");
    return;
  }

  const rootDir = inferRootDir(tsConfig, configDir);
  const absoluteOutDir = resolve(configDir, outDir);

  const entries = collectNonTypescriptFiles(tsConfig, configDir);
  const selectedFiles = selectFiles(entries, files);
  logger.warning(`📁 Found ${entries.length} non-TypeScript files, copying ${selectedFiles.length} files...`);

  for (const filePath of selectedFiles) {
    const relativePath = relative(rootDir, filePath);
    const outputFilePath = resolve(absoluteOutDir, relativePath);

    fs.mkdirSync(dirname(outputFilePath), { recursive: true });
    fs.writeFileSync(outputFilePath, fs.readFileSync(resolve(filePath), "utf-8"));
  }
}

/**
 * Создаёт watcher для non-TypeScript файлов
 *
 * Использует chokidar для отслеживания изменений в non-ts файлах
 * и копирует их в output директорию при изменении.
 * Использует ту же логику определения rootDir, что и collectNonTypescriptFiles.
 *
 * @param context - Контекст сборки
 * @param onChange - Callback при изменении файла (опционально)
 * @returns Контроллер для остановки watch
 */
export function watchNonTypescriptFiles(context: BuildContext, onChange?: (filePath: string) => void): { close: () => void } {
  const { tsConfig, options, cwd } = context;

  if (options.includeNonTsFiles === false) {
    // Возвращаем пустой контроллер если non-ts файлы отключены
    return { close: () => {} };
  }

  const { outDir } = tsConfig.options;
  const configDir = cwd || process.cwd();

  if (!outDir) {
    logger.warning("outDir not set, skipping non-TypeScript files watch");
    return { close: () => {} };
  }

  // Используем ту же логику что и collectNonTypescriptFiles
  const rootDir = inferRootDir(tsConfig, configDir);
  const absoluteOutDir = resolve(configDir, outDir);

  // Формируем ignored паттерны
  const { exclude } = tsConfig.raw || {};
  const ignoredPatterns: (string | RegExp | ((path: string) => boolean))[] = [
    /node_modules/,
    // Игнорируем TypeScript файлы
    (filePath: string) => TS_EXTENSIONS.some((ext) => filePath.endsWith(ext)),
  ];

  // Добавляем exclude из tsconfig
  if (exclude) {
    for (const pattern of exclude) {
      ignoredPatterns.push(resolve(configDir, pattern).replace(/\\/g, "/"));
    }
  }

  // Исключаем outDir
  if (isSubpath(rootDir, absoluteOutDir)) {
    ignoredPatterns.push((filePath: string) => isSubpath(absoluteOutDir, filePath) || filePath === absoluteOutDir);
  }

  logger.info(`📁 Watching non-TS files in: ${rootDir}`);

  // Создаём watcher на rootDir
  const watcher = chokidar.watch(rootDir, {
    ignored: ignoredPatterns,
    ignoreInitial: true,
    persistent: true,
  });

  // Debug events
  watcher.on("ready", () => {
    logger.info("📁 Non-TS watcher ready");
  });
  watcher.on("error", (error) => {
    logger.error(`📁 Non-TS watcher error: ${error}`);
  });

  /**
   * Проверяет, является ли файл non-TS файлом для копирования
   * (дополнительная проверка, т.к. chokidar ignored может пропустить)
   */
  const isNonTsFile = (filePath: string): boolean => {
    return !TS_EXTENSIONS.some((ext) => filePath.endsWith(ext));
  };

  /**
   * Копирует файл в output директорию
   */
  const copyFile = (filePath: string) => {
    // Фильтруем TypeScript файлы
    if (!isNonTsFile(filePath)) {
      return;
    }

    try {
      const relativePath = relative(rootDir, filePath);
      const outputFilePath = resolve(absoluteOutDir, relativePath);

      fs.mkdirSync(dirname(outputFilePath), { recursive: true });
      fs.copyFileSync(filePath, outputFilePath);

      logger.info(`📄 Copied: ${relativePath}`);

      if (onChange) {
        onChange(outputFilePath);
      }
    } catch (error) {
      logger.error(`Failed to copy ${filePath}: ${error}`);
    }
  };

  /**
   * Удаляет файл из output директории
   */
  const deleteFile = (filePath: string) => {
    // Фильтруем TypeScript файлы
    if (!isNonTsFile(filePath)) {
      return;
    }

    try {
      const relativePath = relative(rootDir, filePath);
      const outputFilePath = resolve(absoluteOutDir, relativePath);

      if (fs.existsSync(outputFilePath)) {
        fs.unlinkSync(outputFilePath);
        logger.info(`🗑️ Deleted: ${relativePath}`);

        if (onChange) {
          onChange(filePath);
        }
      }
    } catch (error) {
      logger.error(`Failed to delete ${filePath}: ${error}`);
    }
  };

  // Обработчики событий
  watcher.on("add", copyFile);
  watcher.on("change", copyFile);
  watcher.on("unlink", deleteFile);

  return {
    close: () => {
      watcher.close();
    },
  };
}
