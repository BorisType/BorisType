/**
 * Общие XML builder/parser пресеты
 *
 * Централизованные экземпляры XMLBuilder/XMLParser для использования
 * в linking-генераторах, building/output и других модулях.
 *
 * @module core/utils/xml
 */

import { XMLBuilder, XMLParser } from "fast-xml-parser";

/** Общие опции парсера */
const BASE_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  format: true,
  indentBy: "\t",
  processEntities: true,
  htmlEntities: true,
  cdataPropName: "__cdata",
} as const;

/** Общие опции для всех XML builder'ов */
const BASE_BUILDER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  format: true,
  indentBy: "\t",
  processEntities: true,
  htmlEntities: true,
  cdataPropName: "__cdata",
} as const;

/**
 * XML parser с поддержкой атрибутов, CDATA и HTML entities.
 *
 * - `htmlEntities: true` — декодирует `&#10;` → `\n`
 * - `parseTagValue: false` — не приводит текст к числам (сохраняет hex)
 * - `cdataPropName: "__cdata"` — сохраняет CDATA секции
 */
export const xmlParser = new XMLParser(BASE_PARSER_OPTIONS);

/**
 * XML builder с подавлением пустых узлов.
 * Используется для init.xml, SPXML output.
 */
export const xmlBuilder = new XMLBuilder({
  ...BASE_BUILDER_OPTIONS,
  suppressEmptyNode: true,
});

/**
 * XML builder без подавления пустых узлов.
 * Используется для api_ext.xml, component SPXML, objects XML.
 */
export const xmlBuilderKeepEmpty = new XMLBuilder({
  ...BASE_BUILDER_OPTIONS,
  suppressEmptyNode: false,
});
