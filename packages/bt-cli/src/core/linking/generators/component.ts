/**
 * Генераторы для компонентов (spxml файлы)
 * @module linking/generators/component
 */

import { xmlBuilderKeepEmpty } from "../../utils/xml";

/**
 * Генерирует содержимое XML файла компонента (spxml/<name>.xml)
 *
 * @param componentName - Имя компонента (обычно name из package.json)
 * @returns Содержимое XML файла компонента
 *
 * @remarks
 * XML файл компонента создаётся в директории spxml/.
 * Содержит определение компонента с атрибутом CODE-LIB="1".
 *
 * @example
 * ```ts
 * buildComponentXml('my-component')
 * // Возвращает XML с тегом <my-component></my-component>
 * ```
 */
export function buildComponentXml(componentName: string): string {
  const xmlObj = {
    "?xml": { "@_version": "1.0", "@_encoding": "utf-8" },
    "SPXML-INLINE-FORM": {
      "@_CODE-LIB": "1",
      [componentName]: "",
    },
  };

  return xmlBuilderKeepEmpty.build(xmlObj);
}

/**
 * Генерирует содержимое JS файла компонента (spxml/<name>.js)
 *
 * @param componentName - Имя компонента (обычно name из package.json)
 * @param mainFile - Путь к главному файлу (main из package.json)
 * @param rootUrl - URL корневой директории пакета (x-local://...)
 * @returns Содержимое JS файла компонента
 *
 * @remarks
 * JS файл компонента содержит функцию init(), которая:
 * - Загружает модуль через bt.require
 * - Логирует состояние инициализации
 * - Обрабатывает ошибки
 *
 * @example
 * ```ts
 * buildComponentJs('my-component', './index.js', 'x-local://components/my-component')
 * ```
 */
export function buildComponentJs(componentName: string, mainFile: string, rootUrl: string): string {
  const content = `function init() {
  try {
    alert('Component ${componentName} initializing...');
    bt.require('${mainFile}', '${rootUrl}/spxml')
    alert('Component ${componentName} initialized');
  } catch (g_err) {
    alert('ERROR: Component initializing: ${componentName}:\\r\\n' + g_err);
    throw g_err;
  }
}`;

  return content;
}

/**
 * Результат генерации файлов компонента
 */
export interface ComponentFiles {
  /** Содержимое XML файла */
  xml: string;
  /** Содержимое JS файла */
  js: string;
  /** Имя файлов (без расширения) */
  fileName: string;
}

/**
 * Генерирует все файлы для компонента
 *
 * @param componentName - Имя компонента
 * @param mainFile - Путь к главному файлу
 * @param rootUrl - URL корневой директории
 * @returns Объект с содержимым XML и JS файлов
 */
export function buildComponentFiles(componentName: string, mainFile: string, rootUrl: string): ComponentFiles {
  return {
    xml: buildComponentXml(componentName),
    js: buildComponentJs(componentName, mainFile, rootUrl),
    fileName: componentName,
  };
}
