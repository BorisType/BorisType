/**
 * Локальный индекс объектов платформы.
 *
 * Сканирует objects/ директории всех пакетов проекта и строит
 * map: id → {package, path, type}.
 *
 * @module objects/local-index
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../logger.js";

// ─── Types ──────────────────────────────────────────────────────

/**
 * Запись локального объекта.
 */
export type LocalObjectEntry = {
  /** Имя пакета (или "." для single-package) */
  packageName: string;
  /** Абсолютный путь к XML файлу */
  filePath: string;
  /** Тип объекта (имя родительской директории: server_agent, group, ...) */
  type: string;
};

/**
 * Индекс: object ID → LocalObjectEntry.
 */
export type LocalObjectIndex = Record<string, LocalObjectEntry>;

// ─── Implementation ─────────────────────────────────────────────

/**
 * Сканирует objects/ директории всех пакетов и строит индекс.
 *
 * Multi-package: для каждого пакета ищет {cwd}/{package}/objects/\*\*.xml
 * Single-package (packages = ["."]): ищет {cwd}/objects/\*\*.xml
 *
 * @param cwd - Рабочая директория проекта
 * @param packages - Имена пакетов из btconfig (или ["."] для single)
 * @returns Индекс: id → {packageName, filePath, type}
 */
export function buildLocalObjectIndex(cwd: string, packages: string[]): LocalObjectIndex {
  const index: LocalObjectIndex = {};

  for (const pkg of packages) {
    const objectsDir = path.join(cwd, pkg, "objects");

    if (!fs.existsSync(objectsDir)) continue;

    scanObjectsDir(objectsDir, pkg, index);
  }

  return index;
}

/**
 * Рекурсивно сканирует директорию objects/ и добавляет найденные XML файлы в индекс.
 *
 * Ожидаемая структура: objects/{type}/{id}.xml
 *
 * @param objectsDir - Абсолютный путь к objects/ директории
 * @param packageName - Имя пакета
 * @param index - Индекс для заполнения
 */
function scanObjectsDir(objectsDir: string, packageName: string, index: LocalObjectIndex): void {
  let typeDirs: fs.Dirent[];

  try {
    typeDirs = fs.readdirSync(objectsDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const typeDir of typeDirs) {
    if (!typeDir.isDirectory()) continue;

    const typePath = path.join(objectsDir, typeDir.name);
    let files: fs.Dirent[];

    try {
      files = fs.readdirSync(typePath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".xml")) continue;

      const id = file.name.slice(0, -4); // remove .xml
      const filePath = path.join(typePath, file.name);

      if (index[id]) {
        logger.warning(`Object ${id} found in multiple packages: ${index[id].packageName} and ${packageName}. Using first.`);
        continue;
      }

      index[id] = {
        packageName,
        filePath,
        type: typeDir.name,
      };
    }
  }
}
