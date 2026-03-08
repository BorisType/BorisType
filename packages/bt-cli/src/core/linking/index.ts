/**
 * Модуль линковки пакетов
 *
 * Реализует Pipeline + Registry архитектуру:
 * - Pipeline: последовательные этапы обработки (resolve → link → finalize)
 * - Registry: реестр линковщиков по типам пакетов
 *
 * @module linking
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../logger";
import { getSystemDependencies, printFlattenedTree } from "./dependencies";
import { BtConfigLinkingPackage, getBTConfig } from "../config";
import { LinkingOptions } from "./types";
import { createLinkingContext, prepareDistDirectory, addLinkedPackage } from "./context";
import { LinkingCache } from "./cache";
import { copyWithPrefix, normalizePackageType, isExecutablePackageType } from "./utils";
import { linkPackage } from "./linkers";
import { buildApiExt } from "./generators";
import { parseCompilerDependencyPackageInfo, parseUserPackageInfo } from "./parsers";
import { collectExecutables } from "./executables";

// Re-export всех типов и утилит для удобства
export * from "./types";
export * from "./utils";
export * from "./generators";
export * from "./linkers";
export {
  createLinkingContext,
  prepareDistDirectory,
  addLinkedPackage,
  addExecutable,
} from "./context";
export { LinkingCache } from "./cache";

/**
 * Главная точка входа для линковки
 *
 * @param options - Опции линковки
 *
 * @remarks
 * Выполняет полный процесс линковки:
 * 1. Определяет пакеты для линковки (из btconfig.json или package.json)
 * 2. Определяет зависимости компилятора (polyfill и т.д.)
 * 3. Обрабатывает каждый пакет через соответствующий линковщик
 * 4. Создаёт api_ext.xml
 */
export async function processLinking(options: LinkingOptions = {}): Promise<void> {
  const projectPath = process.cwd();

  // Получаем список пакетов для линковки
  const packagesToLink = resolvePackagesToLink(projectPath);

  logger.success(`📋 Found ${packagesToLink.length} package(s) to link`);

  await processPackagesLinking(projectPath, packagesToLink, options);

  process.exit(0);
}

/**
 * Определяет список пакетов для линковки
 *
 * Логика определения:
 * 1. Если есть btconfig.json с linking.packages — используем packages
 * 2. Если есть btconfig.json с linking (без packages) — текущий проект
 * 3. Если нет btconfig.json — текущий проект из package.json
 *
 * @param projectPath - Путь к корневой директории проекта
 * @returns Массив пакетов для линковки
 */
export function resolvePackagesToLink(projectPath: string): BtConfigLinkingPackage[] {
  const btConfig = getBTConfig(projectPath);

  // Случай 1: btconfig.json с packages
  if (btConfig?.linking?.packages && btConfig.linking.packages.length > 0) {
    return btConfig.linking.packages;
  }

  // Случай 2: btconfig.json с linking (текущий проект)
  if (btConfig?.linking && !btConfig.linking.packages) {
    const { source, target } = btConfig.linking;
    return [
      {
        name: ".", // Текущий проект
        source,
        target,
      },
    ];
  }

  // Случай 3: Нет btconfig.json — проверяем package.json
  const packageJsonPath = path.join(projectPath, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    logger.error("❌ No btconfig.json and no package.json found. Nothing to link.");
    process.exit(1);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const packageType = normalizePackageType(packageJson["ws:package"]);

  if (!packageType || !isExecutablePackageType(packageType)) {
    logger.error(
      '❌ No btconfig.json found and current project is not an executable BorisType package (ws:package must be "standalone", "component", "system"). Nothing to link.',
    );
    process.exit(1);
  }

  // Виртуальная конфигурация из package.json
  return [
    {
      name: ".", // Текущая директория
    },
  ];
}

/**
 * Линковка пакетов
 *
 * @param projectPath - Путь к корню проекта
 * @param packages - Пакеты для линковки
 * @param options - Опции линковки (включая devMode и changedFiles)
 */
export async function processPackagesLinking(
  projectPath: string,
  packages: BtConfigLinkingPackage[],
  options: LinkingOptions = {},
): Promise<void> {
  // При --clean сначала удаляем кэш, потом создаём контекст
  if (options.clean) {
    LinkingCache.removeAll(projectPath);
  }

  // Создаём контекст линковки
  const ctx = createLinkingContext({
    projectPath,
    systemLinkMode: options.systemLinkMode ?? "component",
    noCache: options.noCache,
    logger,
    devMode: options.devMode,
    changedFiles: options.changedFiles,
  });

  logger.success(`📦 System packages will be linked as: ${ctx.systemLinkMode}`);

  if (!ctx.cache.isEnabled()) {
    logger.warning("⚠️  Cache disabled (--no-cache)");
  }

  // Подготавливаем dist директорию (кэш уже очищен если нужно)
  prepareDistDirectory(ctx, options.clean);

  // === STAGE 1: Линковка system-пакетов (runtime и т.д.) ===
  if (options.externalRuntime) {
    logger.success("⏭️  System packages skipped (--external-runtime)");
  } else {
    const systemDeps = await getSystemDependencies(projectPath);

    if (systemDeps.length === 0) {
      logger.warning(
        "⚠️  System-пакеты (например @boristype/runtime) не найдены в зависимостях проекта.",
      );
      logger.warning("   Добавьте @boristype/runtime в dependencies/devDependencies проекта,");
      logger.warning("   или используйте --external-runtime если runtime управляется извне.");
    } else {
      logger.success(`📦 Found ${systemDeps.length} system package(s):`);
      printFlattenedTree(systemDeps);

      for (const dep of systemDeps) {
        const pkgInfo = parseCompilerDependencyPackageInfo(dep, ctx);

        if (!pkgInfo) {
          continue;
        }

        logger.success(`  📦 ${pkgInfo.packageJson.name}: ${pkgInfo.targetPath}`);

        // Копируем файлы
        copyWithPrefix(pkgInfo.sourceDir, ctx.distPath, pkgInfo.targetPath);

        // Линкуем через соответствующий линковщик
        const result = linkPackage(pkgInfo, ctx);
        addLinkedPackage(ctx, result);
      }
    }
  }

  // === STAGE 2: Линковка пользовательских пакетов ===
  for (const packageConfig of packages) {
    // name === '.' означает текущую директорию
    const packageDirAbsolute =
      packageConfig.name === "." ? projectPath : path.join(projectPath, packageConfig.name);

    const displayName = packageConfig.name === "." ? "current project" : packageConfig.name;
    logger.success(`📦 Processing package: ${displayName}`);

    // Парсим информацию о пакете
    const pkgInfo = parseUserPackageInfo(
      projectPath,
      packageDirAbsolute,
      packageConfig,
      displayName,
    );

    if (!pkgInfo) {
      // Обычная директория (не BT пакет) - просто копируем
      continue;
    }

    // Собираем executables из .executables.json
    collectExecutables(pkgInfo, ctx);

    // Линкуем через соответствующий линковщик
    const result = linkPackage(pkgInfo, ctx);
    addLinkedPackage(ctx, result);
  }

  // === STAGE 3: Создаём api_ext.xml ===
  if (ctx.apiExtEntries.length > 0) {
    const apiExtXml = buildApiExt(ctx.apiExtEntries);
    const apiExtXmlFilePath = path.join(ctx.distPath, "source", "api_ext.xml");
    fs.mkdirSync(path.dirname(apiExtXmlFilePath), { recursive: true });
    fs.writeFileSync(apiExtXmlFilePath, "\uFEFF" + apiExtXml, { encoding: "utf-8" });
    logger.success(`📄 Generated api_ext.xml with ${ctx.apiExtEntries.length} entries`);
  }

  logger.success(`✅ Linking completed (${packages.length} package(s))`);
}
