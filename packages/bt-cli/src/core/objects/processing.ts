/**
 * Client-side processing для platform objects sync.
 *
 * Принимает FetchedObject[] из Phase 2 и выполняет всю обработку локально:
 * фильтрация по типу, извлечение метаданных из XML, классификация ownership,
 * построение локального индекса, нормализация XML, hash compare.
 *
 * @module objects/processing
 */

import * as fs from "node:fs";
import type { FetchedObject, ObjectChange, ObjectMetadata, ChangeSet } from "./types.js";
import { buildLocalObjectIndex } from "./local-index.js";
import { extractMetadata, normalizeXmlForComparison, computeHash, classifyOwnership } from "./xml-utils.js";

// ─── Types ──────────────────────────────────────────────────────

/**
 * Опции для processObjects.
 */
export type ProcessObjectsOptions = {
  /** Разрешённые типы объектов из btconfig.objects.include */
  includeTypes: string[];
  /** Имя пользователя из btconfig.properties (для ownership) */
  username: string;
  /** Рабочая директория проекта */
  cwd: string;
  /** Имена пакетов из btconfig (или ["."] для single) */
  packages: string[];
};

// ─── Filtering ──────────────────────────────────────────────────

/**
 * Фильтрует объекты по типу (record.form).
 *
 * @param objects - Массив скачанных объектов
 * @param includeTypes - Разрешённые типы
 * @returns Принятые и отфильтрованные объекты
 */
function filterByType(objects: FetchedObject[], includeTypes: string[]): { accepted: FetchedObject[]; filteredOut: FetchedObject[] } {
  const typeSet = new Set(includeTypes);
  const accepted: FetchedObject[] = [];
  const filteredOut: FetchedObject[] = [];

  for (const obj of objects) {
    if (typeSet.has(obj.record.form)) {
      accepted.push(obj);
    } else {
      filteredOut.push(obj);
    }
  }

  return { accepted, filteredOut };
}

// ─── Change Detection ───────────────────────────────────────────

/**
 * Обрабатывает один объект: извлекает метаданные, нормализует XML,
 * сравнивает с локальным файлом, определяет статус.
 */
function processOneObject(
  fetched: FetchedObject,
  metadata: ObjectMetadata,
  username: string,
  localIndex: ReturnType<typeof buildLocalObjectIndex>,
): ObjectChange {
  const ownership = classifyOwnership(metadata, username);
  const normalizedRemote = normalizeXmlForComparison(fetched.xml);
  const remoteHash = computeHash(normalizedRemote);

  const localEntry = localIndex[metadata.id];

  if (!localEntry) {
    return {
      metadata,
      xml: fetched.xml,
      normalizedXml: normalizedRemote,
      status: "new",
      ownership,
      existingPackage: null,
      existingPath: null,
      remoteHash,
      localHash: null,
    };
  }

  // Читаем локальный файл и сравниваем
  let localHash: string | null = null;
  let status: ObjectChange["status"] = "modified";

  try {
    const localXml = fs.readFileSync(localEntry.filePath, "utf-8");
    const normalizedLocal = normalizeXmlForComparison(localXml);
    localHash = computeHash(normalizedLocal);

    if (localHash === remoteHash) {
      status = "unchanged";
    }
  } catch {
    // Файл не читается — считаем modified
    status = "modified";
  }

  return {
    metadata,
    xml: fetched.xml,
    normalizedXml: normalizedRemote,
    status,
    ownership,
    existingPackage: localEntry.packageName,
    existingPath: localEntry.filePath,
    remoteHash,
    localHash,
  };
}

// ─── Main Pipeline ──────────────────────────────────────────────

/**
 * Обрабатывает все скачанные объекты.
 *
 * Pipeline:
 * 1. Фильтрация по типу (btconfig.objects.include)
 * 2. Извлечение метаданных из XML
 * 3. Построение локального индекса (scan packages)
 * 4. Нормализация XML, hash compare, classification
 *
 * @param fetched - Массив объектов из Phase 2 (с полным XML)
 * @param options - Конфигурация обработки
 * @returns ChangeSet для interactive UI
 */
export function processObjects(fetched: FetchedObject[], options: ProcessObjectsOptions): ChangeSet {
  // 1. Filter by type
  const { accepted, filteredOut } = filterByType(fetched, options.includeTypes);

  // 2. Build local index
  const localIndex = buildLocalObjectIndex(options.cwd, options.packages);

  // 3. Process each object: extract metadata, normalize, hash, classify
  const changes: ObjectChange[] = [];
  const unchanged: ObjectChange[] = [];

  for (const obj of accepted) {
    const metadata = extractMetadata(obj);
    const change = processOneObject(obj, metadata, options.username, localIndex);

    if (change.status === "unchanged") {
      unchanged.push(change);
    } else {
      changes.push(change);
    }
  }

  return {
    changes,
    unchanged,
    filteredByType: filteredOut,
    availablePackages: options.packages,
  };
}
