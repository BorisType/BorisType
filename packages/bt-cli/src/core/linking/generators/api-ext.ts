/**
 * Генератор api_ext.xml
 * @module linking/generators/api-ext
 */

import { xmlBuilderKeepEmpty, xmlParser } from "../../utils/xml";
import { ApiExtEntry } from "../types";

/**
 * Генерирует содержимое api_ext.xml файла
 *
 * @param entries - Массив записей для api_ext.xml
 * @returns Содержимое api_ext.xml файла
 *
 * @remarks
 * api_ext.xml содержит список модулей и их библиотек (libs).
 * Создаётся один раз для всего проекта в dist/source/api_ext.xml.
 *
 * Структура:
 * ```xml
 * <api_ext>
 *   <apis>
 *     <api>
 *       <name>module:mypackage</name>
 *       <libs>
 *         <lib><path>x-local://wt/mypackage/init.xml</path></lib>
 *       </libs>
 *     </api>
 *   </apis>
 * </api_ext>
 * ```
 *
 * @example
 * ```ts
 * const entries = [
 *   { name: 'module:polyfill', libs: ['x-local://wt/polyfill/init.xml'] },
 *   { name: 'module:myapp', libs: ['x-local://wt/myapp/init.xml'] }
 * ];
 * const xml = buildApiExt(entries);
 * ```
 */
export function buildApiExt(entries: ApiExtEntry[], template?: string, startup?: ApiExtEntry): string {
  const xmlObj = template
    ? xmlParser.parse(template)
    : {
        "?xml": { "@_version": "1.0", "@_encoding": "utf-8" },
        api_ext: { apis: {} },
      };
  if (xmlObj.api_ext === "") xmlObj.api_ext = {};
  if (!xmlObj.api_ext || typeof xmlObj.api_ext !== "object") throw new Error("Expected api_ext registry in source/api_ext.xml");
  const apis = xmlObj.api_ext.apis || (xmlObj.api_ext.apis = {});
  const existing = apis.api ? [apis.api].flat() : [];
  const toApi = (entry: ApiExtEntry) => ({
    name: entry.name,
    libs: { lib: entry.libs.map((libPath) => ({ path: libPath })) },
  });
  const combined = [...existing, ...entries.map(toApi)];
  if (startup) {
    if (combined.some((api) => api.name === startup.name)) throw new Error("API name collision in source/api_ext.xml: " + startup.name);
    combined.unshift(toApi(startup));
  }
  apis.api = combined;
  return xmlBuilderKeepEmpty.build(xmlObj);
}
