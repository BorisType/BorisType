/**
 * Утилиты для копирования node_modules
 *
 * Реализует двухуровневую стратегию кэширования:
 * - Tier 1: lockfile hash — обнаруживает изменения в registry-зависимостях
 * - Tier 2: per-library content hash — обнаруживает изменения в локальных (workspace/file) пакетах
 *
 * @module linking/utils/node-modules
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { copyRecursive } from "./copy";
import type { LinkingCache } from "../cache";
import type { Logger, DiscoveredLibrary, LibraryCacheEntry, NodeModulesCacheEntry } from "../types";

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
 * Копирует структуру node_modules с двухуровневым кэшированием
 *
 * @param options - Опции копирования
 * @returns true если копирование было выполнено, false если пропущено (из кэша)
 *
 * @remarks
 * Двухуровневая стратегия:
 * 1. Lockfile hash — если изменился, копируем ВСЕ библиотеки (registry deps могли измениться)
 * 2. Per-library content hash — если lockfile не изменился, проверяем только локальные (symlinked)
 *    библиотеки и копируем только те, чей контент изменился
 *
 * Также выполняет cleanup: если библиотека была в кэше, но больше не найдена в node_modules,
 * удаляет её из dist.
 */
export function copyNodeModulesWithCache(options: CopyNodeModulesOptions): boolean {
  const { searchDir, targetDir, wsName, cache, logger } = options;

  // 1. Вычисляем lockfile hash
  const currentLockfileHash = cache.getLockfileHash(searchDir);

  // 2. Получаем закэшированное состояние
  const cached = cache.getNodeModulesState(wsName);

  // 3. Discover all libraries in node_modules
  const libraries = discoverLibraries(searchDir);

  if (libraries.length === 0) {
    logger.success(`  ├─ node_modules: no libraries found`);
    return false;
  }

  const targetNodeModulesPath = path.join(targetDir, "node_modules");

  const localCount = libraries.filter((l) => l.isLocal).length;
  const registryCount = libraries.length - localCount;
  logger.info(`  ├─ node_modules: found ${libraries.length} libraries (${localCount} local, ${registryCount} registry)`);

  // 4. Определяем нужно ли полное перекопирование
  const lockfileChanged = !currentLockfileHash || !cached || cached.lockfileHash !== currentLockfileHash;

  if (lockfileChanged) {
    const reason = !cached ? "no cache" : !currentLockfileHash ? "lockfile not found" : "lockfile changed";
    logger.info(`  ├─ node_modules: full copy (${reason})`);
    return copyAllLibraries(libraries, targetNodeModulesPath, currentLockfileHash, wsName, cache, logger);
  }

  // 5. Lockfile не изменился → проверяем только локальные библиотеки
  logger.info(`  ├─ node_modules: lockfile unchanged, checking local libraries...`);
  return copyChangedLocalLibraries(libraries, targetNodeModulesPath, cached, currentLockfileHash, wsName, cache, logger);
}

/**
 * Копирует все библиотеки (вызывается при изменении lockfile или отсутствии кэша)
 *
 * @returns true (всегда выполняет копирование)
 */
function copyAllLibraries(
  libraries: DiscoveredLibrary[],
  targetNodeModulesPath: string,
  lockfileHash: string | null,
  wsName: string,
  cache: LinkingCache,
  logger: Logger,
): boolean {
  // Очищаем целевую директорию node_modules для чистого состояния
  if (fs.existsSync(targetNodeModulesPath)) {
    fs.rmSync(targetNodeModulesPath, { recursive: true, force: true });
  }

  const libraryEntries: Record<string, LibraryCacheEntry> = {};

  for (const lib of libraries) {
    copyLibrary(lib, targetNodeModulesPath);
    logger.info(`  │  ├─ ${lib.name} (${lib.isLocal ? "local" : "registry"})`);

    libraryEntries[lib.name] = {
      contentHash: lib.isLocal ? computeLibraryContentHash(lib.realPath) : "",
      isLocal: lib.isLocal,
    };
  }

  // Обновляем кэш
  cache.updateNodeModulesState(wsName, {
    lockfileHash: lockfileHash ?? "",
    libraries: libraryEntries,
    linkedAt: new Date().toISOString(),
    version: 2,
  });

  logger.success(`  ├─ Copied node_modules (${libraries.length} libraries)`);
  return true;
}

/**
 * Проверяет и копирует только изменённые локальные библиотеки
 *
 * @returns true если хотя бы одна библиотека была скопирована, false если всё из кэша
 */
function copyChangedLocalLibraries(
  libraries: DiscoveredLibrary[],
  targetNodeModulesPath: string,
  cached: NodeModulesCacheEntry,
  lockfileHash: string | null,
  wsName: string,
  cache: LinkingCache,
  logger: Logger,
): boolean {
  let copiedCount = 0;
  const updatedLibraries: Record<string, LibraryCacheEntry> = {};

  // Создаём set текущих библиотек для cleanup
  const currentLibNames = new Set(libraries.map((lib) => lib.name));

  for (const lib of libraries) {
    const cachedLib = cached.libraries[lib.name];

    if (lib.isLocal) {
      // Локальная библиотека — проверяем content hash
      const currentHash = computeLibraryContentHash(lib.realPath);
      const needsCopy = !cachedLib || cachedLib.contentHash !== currentHash;

      if (needsCopy) {
        // Удаляем старую копию и копируем заново
        removeLibrary(lib.name, targetNodeModulesPath);
        copyLibrary(lib, targetNodeModulesPath);
        copiedCount++;
        logger.info(`  │  ├─ ${lib.name}: content changed → re-copied`);
      } else {
        logger.info(`  │  ├─ ${lib.name}: unchanged (cached)`);
      }

      updatedLibraries[lib.name] = {
        contentHash: currentHash,
        isLocal: true,
      };
    } else {
      // Registry библиотека — lockfile не изменился, значит она актуальна
      updatedLibraries[lib.name] = cachedLib ?? { contentHash: "", isLocal: false };
    }
  }

  // Cleanup: удаляем библиотеки, которые были в кэше, но больше не в node_modules
  for (const cachedLibName of Object.keys(cached.libraries)) {
    if (!currentLibNames.has(cachedLibName)) {
      removeLibrary(cachedLibName, targetNodeModulesPath);
      copiedCount++;
      logger.info(`  │  ├─ ${cachedLibName}: removed (no longer in dependencies)`);
    }
  }

  // Обновляем кэш
  cache.updateNodeModulesState(wsName, {
    lockfileHash: lockfileHash ?? "",
    libraries: updatedLibraries,
    linkedAt: new Date().toISOString(),
    version: 2,
  });

  if (copiedCount > 0) {
    logger.success(`  ├─ node_modules: updated ${copiedCount} library(ies)`);
  } else {
    logger.success(`  ├─ node_modules skipped (cached)`);
  }

  return copiedCount > 0;
}

/**
 * Обнаруживает все ws:package="library" пакеты в node_modules
 *
 * @param searchDir - Директория, содержащая node_modules/
 * @returns Массив найденных библиотек с метаданными
 *
 * @remarks
 * Обходит node_modules/ аналогично copyNodeModules(), но только собирает метаданные.
 * Определяет локальные (workspace/file) пакеты по наличию symlink.
 * Не копирует файлы и не вычисляет хэши.
 */
export function discoverLibraries(searchDir: string): DiscoveredLibrary[] {
  const nodeModulesPath = path.join(searchDir, "node_modules");

  if (!fs.existsSync(nodeModulesPath)) {
    return [];
  }

  const libraries: DiscoveredLibrary[] = [];
  const items = fs.readdirSync(nodeModulesPath);

  for (const itemName of items) {
    if (itemName.startsWith(".")) {
      continue;
    }

    const sourcePath = path.join(nodeModulesPath, itemName);
    const lstat = fs.lstatSync(sourcePath);

    if (lstat.isDirectory() && itemName.startsWith("@")) {
      // Scoped packages
      const scopedItems = fs.readdirSync(sourcePath);
      for (const scopedItemName of scopedItems) {
        const scopedSourcePath = path.join(sourcePath, scopedItemName);
        const scopedLstat = fs.lstatSync(scopedSourcePath);

        if (scopedLstat.isDirectory() || scopedLstat.isSymbolicLink()) {
          const lib = inspectPackageDirectory(scopedSourcePath, `${itemName}/${scopedItemName}`);
          if (lib) {
            libraries.push(lib);
          }
        }
      }
    } else if (lstat.isDirectory() || lstat.isSymbolicLink()) {
      const lib = inspectPackageDirectory(sourcePath, itemName);
      if (lib) {
        libraries.push(lib);
      }
    }
  }

  return libraries;
}

/**
 * Проверяет директорию пакета и возвращает метаданные если это ws:package="library"
 *
 * @param packagePath - Путь к пакету в node_modules (может быть symlink)
 * @param name - Полное имя пакета (например "@scope/lib")
 * @returns Метаданные библиотеки или null если это не library
 */
function inspectPackageDirectory(packagePath: string, name: string): DiscoveredLibrary | null {
  const lstat = fs.lstatSync(packagePath);
  const isSymlink = lstat.isSymbolicLink();

  let realPath: string;
  try {
    realPath = isSymlink ? fs.realpathSync(packagePath) : packagePath;
  } catch {
    return null;
  }

  const stats = fs.statSync(realPath);
  if (!stats.isDirectory()) {
    return null;
  }

  const packageJsonPath = path.join(realPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  let packageJson: Record<string, unknown>;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  } catch {
    return null;
  }

  if (packageJson["ws:package"] !== "library") {
    return null;
  }

  // Определяем является ли пакет локальным (workspace/file dependency)
  // В pnpm ВСЕ пакеты — symlinks (через .pnpm/ store), поэтому symlink сам по себе не показатель.
  // Локальный пакет: realPath находится ВНЕ node_modules/ (указывает на workspace-директорию).
  // Registry пакет: realPath внутри node_modules/.pnpm/ (content-addressable store).
  const isLocal = isSymlink && !realPath.split(path.sep).includes("node_modules");

  return {
    name,
    realPath,
    sourcePath: packagePath,
    isLocal,
  };
}

/**
 * Вычисляет SHA256 content hash для библиотеки
 *
 * Обходит все файлы библиотеки (исключая node_modules/ и .git),
 * сортирует по relativePath для детерминированности и хэширует
 * полное содержимое каждого файла.
 *
 * @param libraryRealPath - Реальный (resolved) путь к директории библиотеки
 * @returns SHA256 hex digest
 */
export function computeLibraryContentHash(libraryRealPath: string): string {
  const hash = crypto.createHash("sha256");
  const files: { relativePath: string; fullPath: string }[] = [];

  // Собираем список файлов
  collectFiles(libraryRealPath, "", files);

  // Сортируем для детерминированности
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Хэшируем
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    const content = fs.readFileSync(file.fullPath);
    hash.update(content);
    hash.update("\0");
  }

  return hash.digest("hex");
}

/**
 * Рекурсивно собирает все файлы в директории
 *
 * @param dirPath - Абсолютный путь к директории
 * @param relativeTo - Текущий относительный путь (для рекурсии)
 * @param result - Аккумулятор результатов
 */
function collectFiles(dirPath: string, relativeTo: string, result: { relativePath: string; fullPath: string }[]): void {
  const items = fs.readdirSync(dirPath);

  for (const itemName of items) {
    // Исключаем node_modules и .git
    if (itemName === "node_modules" || itemName === ".git") {
      continue;
    }

    const fullPath = path.join(dirPath, itemName);
    const relativePath = relativeTo ? `${relativeTo}/${itemName}` : itemName;

    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      collectFiles(fullPath, relativePath, result);
    } else {
      result.push({ relativePath, fullPath });
    }
  }
}

/**
 * Копирует одну библиотеку в целевую директорию node_modules
 *
 * @param lib - Метаданные библиотеки
 * @param targetNodeModulesPath - Путь к целевой node_modules/
 */
function copyLibrary(lib: DiscoveredLibrary, targetNodeModulesPath: string): void {
  const targetPath = path.join(targetNodeModulesPath, lib.name);

  // Создаём родительскую директорию для scoped packages
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // Копируем содержимое (без nested node_modules)
  copyPackageContent(lib.realPath, targetPath);

  // Рекурсивно обрабатываем вложенные node_modules
  copyNodeModules(lib.realPath, targetPath);
}

/**
 * Удаляет библиотеку из целевой директории node_modules
 *
 * @param libName - Полное имя пакета (например "@scope/lib")
 * @param targetNodeModulesPath - Путь к целевой node_modules/
 *
 * @remarks
 * Для scoped packages: удаляет @scope/lib/, затем @scope/ если она пуста.
 */
function removeLibrary(libName: string, targetNodeModulesPath: string): void {
  const targetPath = path.join(targetNodeModulesPath, libName);

  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  // Для scoped packages: убираем пустую scope-директорию
  if (libName.includes("/")) {
    const scopeDir = path.join(targetNodeModulesPath, libName.split("/")[0]);
    if (fs.existsSync(scopeDir)) {
      const remaining = fs.readdirSync(scopeDir);
      if (remaining.length === 0) {
        fs.rmdirSync(scopeDir);
      }
    }
  }
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
