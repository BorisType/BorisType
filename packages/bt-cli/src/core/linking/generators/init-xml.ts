/**
 * Генератор init.xml для standalone и system пакетов
 * @module linking/generators/init-xml
 */

import { xmlBuilder } from "../../utils/xml";

/**
 * Генерирует содержимое init.xml файла для standalone/system пакетов
 *
 * @param mainFile - Путь к главному файлу (main из package.json)
 * @param rootUrl - URL корневой директории пакета (x-local://...)
 * @returns Содержимое init.xml файла
 *
 * @remarks
 * init.xml используется для загрузки модуля через bt.require.
 * Файл создаётся только для standalone и system пакетов.
 *
 * @example
 * ```ts
 * buildInitXml('./index.js', 'x-local://wt/mypackage')
 * // Возвращает XML с bt.require('./index.js', 'x-local://wt/mypackage')
 * ```
 */
export function buildInitXml(mainFile: string, rootUrl: string): string {
  const xmlObj = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    "SPXML-INLINE-FORM": {
      OnInit: {
        "@_PROPERTY": "1",
        "@_EXPR": `\n    bt.loadObjects('${rootUrl}/objects');\n    bt.require('${mainFile}', '${rootUrl}');\n  `,
      },
    },
  };

  return xmlBuilder.build(xmlObj);
}
