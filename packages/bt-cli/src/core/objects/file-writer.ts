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
import type { SelectedObject, WrittenFile } from "./types.js";

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

  // Ensure XML declaration
  if (!parsed["?xml"]) {
    parsed["?xml"] = { "@_version": "1.0", "@_encoding": "UTF-8" };
  }

  return builder.build(parsed);
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

// ─── Summary Report ─────────────────────────────────────────────

/**
 * Выводит итоговый отчёт о записанных файлах.
 *
 * @param written - Массив записанных файлов
 */
export function printWriteSummary(written: WrittenFile[]): void {
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

  console.log();
  logger.info("Run `git diff` to review.");
}
