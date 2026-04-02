/**
 * XML утилиты для platform objects sync.
 *
 * Извлечение метаданных, нормализация для сравнения, хеширование.
 *
 * @module objects/xml-utils
 */

import * as crypto from "node:crypto";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type { FetchedObject, ObjectMetadata } from "./types.js";

// ─── XML Parser/Builder ─────────────────────────────────────────

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

// ─── Volatile Fields ────────────────────────────────────────────

/**
 * Поля, которые изменяются без реального изменения объекта.
 * Удаляются при нормализации XML для сравнения.
 */
const VOLATILE_FIELDS = new Set(["doc_info", "last_run_date", "last_run_result", "next_run_date"]);

// ─── Metadata Extraction ────────────────────────────────────────

/**
 * Извлекает метаданные из XML документа объекта.
 *
 * @param fetched - Объект с XML и записью из spxml_objects
 * @returns Извлечённые метаданные
 */
export function extractMetadata(fetched: FetchedObject): ObjectMetadata {
  const parsed = parser.parse(fetched.xml);

  const rootKey = Object.keys(parsed).find((k) => k !== "?xml");
  const root = rootKey ? parsed[rootKey] : parsed;

  const docInfo = root?.doc_info ?? {};

  return {
    id: fetched.record.id,
    type: fetched.record.form,
    name: String(root?.name ?? ""),
    modifiedDate: fetched.record.modified,
    modificationAuthor: String(docInfo?.modification_author_login ?? ""),
  };
}

// ─── XML Normalization ──────────────────────────────────────────

/**
 * Удаляет volatile поля из объекта (top-level).
 *
 * @param obj - Объект после парсинга XML
 * @returns Объект без volatile полей
 */
function stripVolatileFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!VOLATILE_FIELDS.has(key)) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Нормализует XML для сравнения.
 * Удаляет volatile поля, сериализует в каноническую форму.
 * Используется ТОЛЬКО для hash compare, не для записи.
 *
 * @param xml - Исходный XML
 * @returns Нормализованная XML-строка
 */
export function normalizeXmlForComparison(xml: string): string {
  const parsed = parser.parse(xml);

  const rootKey = Object.keys(parsed).find((k) => k !== "?xml");
  if (!rootKey) return xml;

  parsed[rootKey] = stripVolatileFields(parsed[rootKey]);

  return builder.build(parsed);
}

// ─── Hashing ────────────────────────────────────────────────────

/**
 * Вычисляет SHA-256 hash строки.
 *
 * @param content - Строка для хеширования
 * @returns Hex-encoded hash
 */
export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Классифицирует ownership объекта по автору модификации.
 *
 * @param metadata - Метаданные объекта
 * @param username - Имя пользователя из btconfig.properties
 * @returns "ours" если автор совпадает, "theirs" иначе
 */
export function classifyOwnership(metadata: ObjectMetadata, username: string): "ours" | "theirs" {
  return metadata.modificationAuthor === username ? "ours" : "theirs";
}
