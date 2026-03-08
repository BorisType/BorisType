/**
 * Создание и управление контекстом линковки
 * @module linking/context
 */

import * as fs from "fs";
import * as path from "path";
import { LinkingContext, ApiExtEntry, LinkedPackage } from "./types";
import { LinkingCache } from "./cache";
import { logger as defaultLogger } from "../logger";

/**
 * Опции для создания контекста линковки
 */
export interface CreateContextOptions {
  /** Корневая директория проекта */
  projectPath: string;
  /** Режим линковки system пакетов (по умолчанию 'component') */
  systemLinkMode?: "standalone" | "component";
  /** Не использовать кэш */
  noCache?: boolean;
  /** Использовать кастомный логгер */
  logger?: typeof defaultLogger;
  /** Режим dev (инкрементальная линковка) */
  devMode?: boolean;
  /** Изменённые файлы (абсолютные пути в build/) — только для devMode */
  changedFiles?: string[];
}

/**
 * Создаёт новый контекст линковки
 *
 * @param options - Опции для создания контекста
 * @returns Инициализированный контекст линковки
 *
 * @remarks
 * Контекст содержит:
 * - Пути к проекту и dist директории
 * - Списки слинкованных пакетов и api_ext записей
 * - Глобальную карту executables
 * - Кэш линковки
 * - Логгер
 */
export function createLinkingContext(options: CreateContextOptions): LinkingContext {
  const {
    projectPath,
    systemLinkMode = "component",
    noCache = false,
    logger = defaultLogger,
    devMode = false,
    changedFiles = [],
  } = options;

  const distPath = path.join(projectPath, "dist");
  const cache = new LinkingCache(projectPath, !noCache);

  return {
    projectPath,
    distPath,
    systemLinkMode,
    cache,
    linkedPackages: [],
    apiExtEntries: [],
    executables: new Map<string, string>(),
    logger,
    devMode,
    changedFiles,
  };
}

/**
 * Подготавливает директорию dist
 *
 * @param ctx - Контекст линковки
 * @param clean - Очистить директорию перед созданием (кэш очищается отдельно до создания контекста)
 */
export function prepareDistDirectory(ctx: LinkingContext, clean: boolean = false): void {
  if (clean) {
    // Очищаем dist
    if (fs.existsSync(ctx.distPath)) {
      fs.rmSync(ctx.distPath, { recursive: true, force: true });
    }

    // Кэш уже очищен до создания контекста
    ctx.logger.success("🧹 Cleaned dist directory and cache");
  }

  if (!fs.existsSync(ctx.distPath)) {
    fs.mkdirSync(ctx.distPath, { recursive: true });
  }
}

/**
 * Добавляет результат линковки в контекст
 *
 * @param ctx - Контекст линковки
 * @param result - Результат линковки пакета
 */
export function addLinkedPackage(ctx: LinkingContext, result: LinkedPackage): void {
  ctx.linkedPackages.push(result);

  if (result.apiext) {
    ctx.apiExtEntries.push(result.apiext);
  }
}

/**
 * Добавляет запись в api_ext напрямую
 *
 * @param ctx - Контекст линковки
 * @param entry - Запись для api_ext.xml
 */
export function addApiExtEntry(ctx: LinkingContext, entry: ApiExtEntry): void {
  ctx.apiExtEntries.push(entry);
}

/**
 * Добавляет executable в глобальную карту
 *
 * @param ctx - Контекст линковки
 * @param key - Ключ файла (packageName+version+filePath)
 * @param url - URL файла (x-local://...)
 */
export function addExecutable(ctx: LinkingContext, key: string, url: string): void {
  ctx.executables.set(key, url);
}

/**
 * Получает статистику линковки
 *
 * @param ctx - Контекст линковки
 * @returns Объект со статистикой
 */
export function getLinkingStats(ctx: LinkingContext): {
  totalPackages: number;
  totalApiExtEntries: number;
  totalExecutables: number;
  packagesByType: Record<string, number>;
} {
  const packagesByType: Record<string, number> = {};

  for (const pkg of ctx.linkedPackages) {
    const type = pkg.info.packageType;
    packagesByType[type] = (packagesByType[type] || 0) + 1;
  }

  return {
    totalPackages: ctx.linkedPackages.length,
    totalApiExtEntries: ctx.apiExtEntries.length,
    totalExecutables: ctx.executables.size,
    packagesByType,
  };
}
