/**
 * Общие XML builder/parser пресеты
 *
 * Централизованные экземпляры XMLBuilder/XMLParser для использования
 * в linking-генераторах, building/output и других модулях.
 *
 * @module core/utils/xml
 */

import { XMLBuilder, XMLParser } from "fast-xml-parser";

/** Общие опции для всех XML builder'ов */
const BASE_BUILDER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  indentBy: "\t",
  processEntities: true,
} as const;

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
 * Используется для api_ext.xml, component SPXML.
 */
export const xmlBuilderKeepEmpty = new XMLBuilder({
  ...BASE_BUILDER_OPTIONS,
  suppressEmptyNode: false,
});

/**
 * XML parser с поддержкой атрибутов.
 * Используется для чтения init.xml, api_ext.xml.
 */
export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});
