/**
 * Кэш синхронизации platform objects.
 *
 * Хранит lastSync дату и индекс известных объектов.
 * Файл: `{cwd}/.btc/objects-cache.json`
 *
 * @module objects/cache
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ObjectsCache, WrittenFile } from "./types.js";

// ─── Constants ──────────────────────────────────────────────────

const BTC_DIR = ".btc";
const CACHE_FILENAME = "objects-cache.json";

// ─── Read ───────────────────────────────────────────────────────

/**
 * Загружает кэш синхронизации объектов.
 *
 * @param cwd - Рабочая директория проекта
 * @returns Кэш или null если файла нет
 */
export function loadObjectsCache(cwd: string): ObjectsCache | null {
  const cachePath = path.join(cwd, BTC_DIR, CACHE_FILENAME);

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(cachePath, "utf-8");
    return JSON.parse(content) as ObjectsCache;
  } catch {
    return null;
  }
}

// ─── Write ──────────────────────────────────────────────────────

/**
 * Обновляет кэш синхронизации.
 *
 * Мержит новые записи с существующим кэшем:
 * - Обновляет `lastSync` на текущее время
 * - Для каждого written файла: добавляет/обновляет entry в objects
 *
 * @param cwd - Рабочая директория проекта
 * @param written - Записанные файлы (из file-writer)
 * @param typeMap - Маппинг objectId → type (из ObjectChange.metadata)
 * @param packageMap - Маппинг objectId → targetPackage (из SelectedObject)
 */
export function updateObjectsCache(
  cwd: string,
  written: WrittenFile[],
  typeMap: Record<string, string>,
  packageMap: Record<string, string>,
): void {
  const existing = loadObjectsCache(cwd) ?? { lastSync: "", objects: {} };

  existing.lastSync = new Date().toISOString();

  for (const w of written) {
    existing.objects[w.objectId] = {
      type: typeMap[w.objectId] ?? "",
      package: packageMap[w.objectId] ?? "",
    };
  }

  const btcDir = path.join(cwd, BTC_DIR);
  fs.mkdirSync(btcDir, { recursive: true });

  const cachePath = path.join(btcDir, CACHE_FILENAME);
  fs.writeFileSync(cachePath, JSON.stringify(existing, null, 2), "utf-8");
}
