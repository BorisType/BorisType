/**
 * Утилиты для копирования node_modules
 * @module linking/utils/node-modules
 */

import * as fs from "fs";
import * as path from "path";
import { copyRecursive } from "./copy";
import type { LinkingCache } from "../cache";
import type { Logger } from "../types";

/**
 * Опции для копирования node_modules с кэшированием
 */
export interface CopyNodeModulesOptions {
  /** Директория для поиска node_modules (где находится package-lock.json) */
  searchDir: string;
  /** Директория куда нужно скопировать найденные пакеты */
  targetDir: string;
  /** ws:name пакета (для кэширования) */
  wsName: string;
  /** Кэш линковки */
  cache: LinkingCache;
  /** Logger для вывода */
  logger: Logger;
}

/**
 * Копирует структуру node_modules с поддержкой кэширования
 *
 * @param options - Опции копирования
 * @returns true если копирование было выполнено, false если пропущено (из кэша)
 *
 * @remarks
 * - Проверяет кэш по hash от package-lock.json
 * - Если hash не изменился - пропускает копирование
 * - После копирования обновляет кэш
 */
export function copyNodeModulesWithCache(options: CopyNodeModulesOptions): boolean {
  const { searchDir, targetDir, wsName, cache, logger } = options;

  // Проверяем нужно ли копировать
  if (!cache.shouldCopyNodeModules(wsName, searchDir)) {
    logger.success(`  ├─ node_modules skipped (cached)`);
    return false;
  }

  // Копируем
  copyNodeModules(searchDir, targetDir);

  // Обновляем кэш
  cache.updateNodeModulesCache(wsName, searchDir);

  logger.success(`  ├─ Copied node_modules`);
  return true;
}

/**
 * Копирует структуру node_modules из исходной директории в целевую
 *
 * @param searchDir - Директория для поиска node_modules
 * @param targetDir - Директория куда нужно скопировать найденные пакеты
 *
 * @remarks
 * - Копирует только пакеты с свойством `ws:package` в package.json
 * - Поддерживает scoped packages (@scope/package)
 * - Пропускает служебные директории, начинающиеся с точки
 * - Рекурсивно обрабатывает вложенные node_modules
 */
export function copyNodeModules(searchDir: string, targetDir: string): void {
  const nodeModulesPath = path.join(searchDir, "node_modules");

  // Проверяем существование node_modules в исходной директории
  if (!fs.existsSync(nodeModulesPath)) {
    return;
  }

  const targetNodeModulesPath = path.join(targetDir, "node_modules");

  // Создаем целевую директорию node_modules если её нет
  if (!fs.existsSync(targetNodeModulesPath)) {
    fs.mkdirSync(targetNodeModulesPath, { recursive: true });
  }

  // Проходим по всем элементам в node_modules
  const items = fs.readdirSync(nodeModulesPath);

  for (const itemName of items) {
    // Пропускаем служебные директории и файлы (например .bin, .package-lock.json и т.д.)
    if (itemName.startsWith(".")) {
      continue;
    }

    const sourcePath = path.join(nodeModulesPath, itemName);
    const targetPath = path.join(targetNodeModulesPath, itemName);

    // Используем lstat чтобы НЕ следовать по symlink на этапе проверки
    const lstat = fs.lstatSync(sourcePath);

    // Если это директория, начинающаяся с @ (scoped packages)
    if (lstat.isDirectory() && itemName.startsWith("@")) {
      // Scoped директория - это просто контейнер для пакетов
      // Создаем её только если в ней будут валидные пакеты
      const scopedItems = fs.readdirSync(sourcePath);
      let hasValidPackages = false;

      for (const scopedItemName of scopedItems) {
        const scopedSourcePath = path.join(sourcePath, scopedItemName);
        const scopedTargetPath = path.join(targetPath, scopedItemName);

        const scopedLstat = fs.lstatSync(scopedSourcePath);
        if (scopedLstat.isDirectory() || scopedLstat.isSymbolicLink()) {
          const copied = processPackageDirectory(scopedSourcePath, scopedTargetPath);
          if (copied && !hasValidPackages) {
            // Создаем scope директорию при первом успешном копировании
            if (!fs.existsSync(targetPath)) {
              fs.mkdirSync(targetPath, { recursive: true });
            }
            hasValidPackages = true;
          }
        }
      }
    }
    // Если это обычная директория или symlink (потенциально пакет)
    else if (lstat.isDirectory() || lstat.isSymbolicLink()) {
      processPackageDirectory(sourcePath, targetPath);
    }
  }
}

/**
 * Обрабатывает директорию пакета - проверяет наличие ws:package и копирует
 *
 * @param packagePath - Путь к пакету (может быть symlink)
 * @param targetPath - Целевой путь для копирования
 * @returns true если пакет был скопирован, false иначе
 *
 * @remarks
 * - Следует по symlink для получения реального пути
 * - Проверяет наличие package.json и свойства ws:package
 * - Копирует содержимое пакета (исключая вложенный node_modules)
 * - Рекурсивно обрабатывает вложенные node_modules
 */
export function processPackageDirectory(packagePath: string, targetPath: string): boolean {
  // Проверяем является ли путь symlink
  const lstat = fs.lstatSync(packagePath);
  const isSymlink = lstat.isSymbolicLink();

  // Получаем реальный путь (следуем по symlink если есть)
  let realPackagePath: string;
  try {
    realPackagePath = isSymlink ? fs.realpathSync(packagePath) : packagePath;
  } catch (error) {
    console.error(`Error resolving path ${packagePath}:`, error);
    return false;
  }

  // Проверяем что это директория
  const stats = fs.statSync(realPackagePath);
  if (!stats.isDirectory()) {
    return false;
  }

  // Проверяем наличие package.json
  const packageJsonPath = path.join(realPackagePath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  // Читаем и парсим package.json
  let packageJson: any;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  } catch (error) {
    console.error(`Error reading ${packageJsonPath}:`, error);
    return false;
  }

  // Копируем только library-пакеты (остальные типы линкуются отдельно)
  const wsPackage = packageJson["ws:package"];
  if (wsPackage !== "library") {
    return false;
  }

  // Копируем содержимое пакета (кроме вложенного node_modules)
  copyPackageContent(realPackagePath, targetPath);

  // Рекурсивно обрабатываем вложенный node_modules
  copyNodeModules(realPackagePath, targetPath);

  return true;
}

/**
 * Копирует содержимое пакета, исключая вложенную папку node_modules
 *
 * @param sourcePath - Путь к исходному пакету
 * @param targetPath - Целевой путь
 *
 * @remarks
 * - Исключает директорию node_modules (обрабатывается отдельно)
 * - Исключает директорию .git
 * - Рекурсивно копирует все остальные файлы и директории
 */
export function copyPackageContent(sourcePath: string, targetPath: string): void {
  // Создаем целевую директорию
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  const items = fs.readdirSync(sourcePath);

  for (const itemName of items) {
    // Пропускаем вложенную папку node_modules
    if (itemName === "node_modules") {
      continue;
    }

    if (itemName === ".git") {
      continue;
    }

    const itemSourcePath = path.join(sourcePath, itemName);
    const itemTargetPath = path.join(targetPath, itemName);

    // Используем statSync чтобы следовать по symlink при копировании содержимого
    const stats = fs.statSync(itemSourcePath);

    if (stats.isDirectory()) {
      copyRecursive(itemSourcePath, itemTargetPath);
    } else {
      fs.copyFileSync(itemSourcePath, itemTargetPath);
    }
  }
}
