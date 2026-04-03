/**
 * File I/O для platform objects sync.
 *
 * Нормализация XML для хранения и запись на диск.
 *
 * @module objects/file-writer
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { logger } from "../logger.js";
import type { SelectedObject, WrittenFile, DeletedObject } from "./types.js";

// ─── XML Normalization for Storage ──────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  indentBy: "\t",
  suppressEmptyNode: false,
});

/**
 * Нормализует XML для записи в файл.
 *
 * НЕ путать с normalizeXmlForComparison из xml-utils —
 * та strip'ит volatile fields для hashing,
 * эта форматирует для читаемости и git.
 *
 * Действия:
 * 1. Parse → rebuild для консистентного форматирования
 * 2. Ensure `<id>` тег под корневым элементом
 * 3. XML declaration в начале
 *
 * @param xml - Исходный XML (полный, с doc_info и volatile полями)
 * @param objectId - ID объекта (для ensure <id>)
 * @returns Нормализованный XML для записи
 */
export function normalizeXmlForStorage(xml: string, objectId: string): string {
  const parsed = parser.parse(xml);
  const rootKey = Object.keys(parsed).find((k) => k !== "?xml");

  if (rootKey) {
    const root = parsed[rootKey];

    // Ensure <id> tag
    if (!root.id) {
      root.id = objectId;
    }
  }

  // Rebuild with ?xml FIRST (key order matters for XMLBuilder)
  const xmlDecl = parsed["?xml"] ?? { "@_version": "1.0", "@_encoding": "UTF-8" };
  const ordered: Record<string, unknown> = { "?xml": xmlDecl };

  for (const key of Object.keys(parsed)) {
    if (key !== "?xml") {
      ordered[key] = parsed[key];
    }
  }

  return builder.build(ordered);
}

// ─── File Writing ───────────────────────────────────────────────

/**
 * Записывает выбранные объекты в файловую систему.
 *
 * Путь: `{cwd}/{targetPackage}/objects/{type}/{id}.xml`
 * Single-package (targetPackage = "."): `{cwd}/objects/{type}/{id}.xml`
 *
 * Директории создаются автоматически.
 *
 * @param cwd - Рабочая директория проекта
 * @param selected - Выбранные объекты с целевыми пакетами
 * @returns Массив записанных файлов
 */
export function writeObjectFiles(cwd: string, selected: SelectedObject[]): WrittenFile[] {
  const written: WrittenFile[] = [];

  for (const { change, targetPackage } of selected) {
    const { metadata, xml } = change;
    const normalizedXml = normalizeXmlForStorage(xml, metadata.id);

    const relativePath = path.join(targetPackage, "objects", metadata.type, `${metadata.id}.xml`);
    const absolutePath = path.join(cwd, relativePath);

    const dirPath = path.dirname(absolutePath);
    const existed = fs.existsSync(absolutePath);

    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(absolutePath, normalizedXml, "utf-8");

    written.push({
      objectId: metadata.id,
      relativePath,
      action: existed ? "updated" : "created",
    });
  }

  return written;
}

// ─── Deleted Objects ────────────────────────────────────────────

/**
 * Удаляет файлы удалённых объектов и записывает их ID в deleted.xml.
 *
 * Для каждого пакета создаётся/обновляется `{pkg}/objects/deleted.xml`
 * содержащий ID удалённых объектов для очистки на сервере.
 *
 * @param cwd - Рабочая директория проекта
 * @param deleted - Удалённые объекты (существующие локально)
 * @returns Количество удалённых файлов
 */
export function deleteObjectFiles(cwd: string, deleted: DeletedObject[]): number {
  if (deleted.length === 0) return 0;

  // 1. Удалить XML-файлы
  for (const obj of deleted) {
    try {
      fs.unlinkSync(obj.filePath);
    } catch {
      // Файл уже удалён — не ошибка
    }
  }

  // 2. Сгруппировать по пакету
  const byPackage = new Map<string, string[]>();
  for (const obj of deleted) {
    const ids = byPackage.get(obj.packageName) ?? [];
    ids.push(obj.record.id);
    byPackage.set(obj.packageName, ids);
  }

  // 3. Обновить deleted.xml в каждом пакете
  for (const [pkg, newIds] of byPackage) {
    updateDeletedXml(cwd, pkg, newIds);
  }

  return deleted.length;
}

/**
 * Обновляет файл `{pkg}/objects/deleted.xml`.
 *
 * Формат: один ID на строку, без дубликатов.
 * Если файл не существует — создаёт.
 *
 * @param cwd - Рабочая директория
 * @param packageName - Имя пакета
 * @param newIds - Новые ID для добавления
 */
function updateDeletedXml(cwd: string, packageName: string, newIds: string[]): void {
  const deletedPath = path.join(cwd, packageName, "objects", "deleted.xml");
  const dirPath = path.dirname(deletedPath);
  fs.mkdirSync(dirPath, { recursive: true });

  // Читаем существующие ID
  let existingIds: string[] = [];
  try {
    const content = fs.readFileSync(deletedPath, "utf-8");
    existingIds = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    // Файл не существует — это нормально
  }

  // Мержим без дубликатов
  const allIds = [...new Set([...existingIds, ...newIds])];

  fs.writeFileSync(deletedPath, allIds.join("\n") + "\n", "utf-8");
}

// ─── Summary Report ─────────────────────────────────────────────

/**
 * Выводит итоговый отчёт о записанных файлах.
 *
 * @param written - Массив записанных файлов
 * @param deletedCount - Количество удалённых файлов
 */
export function printWriteSummary(written: WrittenFile[], deletedCount: number = 0): void {
  const created = written.filter((w) => w.action === "created");
  const updated = written.filter((w) => w.action === "updated");

  console.log();
  logger.success("Objects sync complete:");

  if (created.length > 0) {
    logger.info(`  Created: ${created.length}`);
    for (const w of created) {
      logger.info(`    ${w.relativePath}`);
    }
  }

  if (updated.length > 0) {
    logger.info(`  Updated: ${updated.length}`);
    for (const w of updated) {
      logger.info(`    ${w.relativePath}`);
    }
  }

  if (deletedCount > 0) {
    logger.info(`  Deleted: ${deletedCount}`);
  }

  console.log();
  logger.info("Run `git diff` to review.");
}
