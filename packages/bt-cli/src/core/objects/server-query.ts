/**
 * Server query layer для platform objects sync.
 *
 * Выполняет запросы к серверу через Evaluator:
 * - list: получает все изменённые объекты из spxml_objects
 * - fetch: получает полный XML документа по ID
 *
 * @module objects/server-query
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Evaluator } from "@boristype/ws-client";
import type { SpxmlObjectRecord, FetchedObject } from "./types.js";
import { logger } from "../logger.js";

// ─── Resources ──────────────────────────────────────────────────

const RESOURCES_DIR = path.join(__dirname, "..", "..", "..", "resources");

/**
 * Читает шаблон .bs из resources/ директории.
 *
 * @param filename - Имя файла в resources/
 * @returns Содержимое шаблона
 */
function loadTemplate(filename: string): string {
  return fs.readFileSync(path.join(RESOURCES_DIR, filename), "utf-8");
}

/**
 * Подставляет переменные в шаблон.
 * Переменные обозначаются как `{{name}}`.
 *
 * @param template - Строка шаблона
 * @param vars - Переменные для подстановки
 * @returns Строка с подставленными значениями
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

// ─── Queries ────────────────────────────────────────────────────

/**
 * Запрашивает список изменённых объектов из spxml_objects.
 * Возвращает все объекты с modified >= sinceDate.
 * Фильтрация по типу НЕ выполняется — это делает клиент.
 *
 * @param evaluator - Evaluator для выполнения кода на сервере
 * @param sinceDate - Дата начала (ISO 8601)
 * @returns Массив записей из spxml_objects
 */
export async function listModifiedObjects(evaluator: Evaluator, sinceDate: string): Promise<SpxmlObjectRecord[]> {
  const template = loadTemplate("objects_list.bs");
  const script = renderTemplate(template, { since_date: sinceDate });

  const result = await evaluator.eval(script);
  return JSON.parse(result) as SpxmlObjectRecord[];
}

/**
 * Получает полный XML документа по ID.
 * Выбрасывает ошибку если объект не найден.
 *
 * @param evaluator - Evaluator для выполнения кода на сервере
 * @param objectId - ID объекта
 * @returns XML-строка документа
 */
export async function fetchObjectXml(evaluator: Evaluator, objectId: string): Promise<string> {
  const template = loadTemplate("objects_fetch.bs");
  const script = renderTemplate(template, { object_id: objectId });

  return await evaluator.eval(script);
}

// ─── Pull Pipeline ──────────────────────────────────────────────

/**
 * Выполняет полный цикл: list → fetch ALL.
 * Возвращает массив FetchedObject с XML для каждого объекта.
 *
 * @param evaluator - Evaluator для выполнения кода на сервере
 * @param sinceDate - Дата начала (ISO 8601)
 * @param onProgress - Callback для отображения прогресса (fetched, total)
 * @returns Массив объектов с полным XML
 */
export async function pullAllObjects(
  evaluator: Evaluator,
  sinceDate: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<FetchedObject[]> {
  const records = await listModifiedObjects(evaluator, sinceDate);

  if (records.length === 0) return [];

  const results: FetchedObject[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    try {
      const xml = await fetchObjectXml(evaluator, record.id);
      results.push({ record, xml });
    } catch (err) {
      logger.warning(`Failed to fetch object ${record.id} (${record.form}): ${err}`);
    }

    onProgress?.(i + 1, records.length);
  }

  return results;
}
