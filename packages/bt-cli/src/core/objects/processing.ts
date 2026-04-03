/**
 * Client-side processing для platform objects sync.
 *
 * Принимает PullResult из Phase 2 и выполняет обработку:
 * извлечение метаданных из XML, классификация ownership,
 * построение локального индекса, нормализация XML, hash compare,
 * определение удалённых объектов для удаления.
 *
 * @module objects/processing
 */

import * as fs from "node:fs";
import type { FetchedObject, SpxmlObjectRecord, ObjectChange, ObjectMetadata, ChangeSet, DeletedObject } from "./types.js";
import { buildLocalObjectIndex } from "./local-index.js";
import { extractMetadata, normalizeXmlForComparison, computeHash, classifyOwnership } from "./xml-utils.js";

// ─── Types ──────────────────────────────────────────────────────

/**
 * Опции для processObjects.
 */
export type ProcessObjectsOptions = {
  /** Имя пользователя из btconfig.properties (для ownership) */
  username: string;
  /** Рабочая директория проекта */
  cwd: string;
  /** Имена пакетов из btconfig (или ["."] для single) */
  packages: string[];
  /** Удалённые записи из server list (is_deleted != null) */
  deletedRecords?: SpxmlObjectRecord[];
  /** Количество записей отфильтрованных по типу (для summary) */
  filteredByTypeCount?: number;
};

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

// ─── Deleted Objects ────────────────────────────────────────────

/**
 * Находит удалённые объекты, которые существуют локально.
 *
 * @param deletedRecords - Записи с is_deleted != null из server list
 * @param localIndex - Локальный индекс объектов
 * @returns Массив DeletedObject для удаления
 */
function findLocalDeletedObjects(
  deletedRecords: SpxmlObjectRecord[],
  localIndex: ReturnType<typeof buildLocalObjectIndex>,
): DeletedObject[] {
  const result: DeletedObject[] = [];

  for (const record of deletedRecords) {
    const localEntry = localIndex[record.id];
    if (localEntry) {
      result.push({
        record,
        packageName: localEntry.packageName,
        filePath: localEntry.filePath,
      });
    }
  }

  return result;
}

// ─── Main Pipeline ──────────────────────────────────────────────

/**
 * Обрабатывает все скачанные объекты.
 *
 * Pipeline:
 * 1. Построение локального индекса (scan packages)
 * 2. Извлечение метаданных, нормализация XML, hash compare, classification
 * 3. Определение удалённых объектов (те что существуют локально)
 *
 * Фильтрация по типу выполняется ранее — в pullAllObjects (до fetch).
 *
 * @param fetched - Массив объектов из Phase 2 (с полным XML)
 * @param options - Конфигурация обработки
 * @returns ChangeSet для interactive UI
 */
export function processObjects(fetched: FetchedObject[], options: ProcessObjectsOptions): ChangeSet {
  // 1. Build local index
  const localIndex = buildLocalObjectIndex(options.cwd, options.packages);

  // 2. Process each object: extract metadata, normalize, hash, classify
  const changes: ObjectChange[] = [];
  const unchanged: ObjectChange[] = [];

  for (const obj of fetched) {
    const metadata = extractMetadata(obj);
    const change = processOneObject(obj, metadata, options.username, localIndex);

    if (change.status === "unchanged") {
      unchanged.push(change);
    } else {
      changes.push(change);
    }
  }

  // 3. Find deleted objects that exist locally
  const deleted = findLocalDeletedObjects(options.deletedRecords ?? [], localIndex);

  return {
    changes,
    unchanged,
    deleted,
    filteredByTypeCount: options.filteredByTypeCount ?? 0,
    availablePackages: options.packages,
  };
}
