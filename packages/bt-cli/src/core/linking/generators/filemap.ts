/**
 * Генератор filemap для executable модулей
 * @module linking/generators/filemap
 */

/**
 * Данные для filemap
 */
export interface FileMapData {
  /** Карта: ключ файла -> URL файла */
  [key: string]: string;
}

/**
 * Генерирует содержимое .filemap.json для модуля
 *
 * @param executables - Карта исполняемых файлов: ключ -> URL
 * @returns JSON-строка для записи в .filemap.json
 *
 * @remarks
 * Filemap используется для маппинга ключей файлов на их URL.
 * Теперь создаётся per-module (в каждом модуле) вместо глобального bt:filemap.
 *
 * Структура ключа: `${packageName}+${packageVersion}+${filePath}`
 *
 * @example
 * ```ts
 * const executables = new Map([
 *   ['mypackage+1.0.0+src/handler.js', 'x-local://wt/mypackage/handler.js']
 * ]);
 * const json = generateFilemapJson(executables);
 * // -> { "mypackage+1.0.0+src/handler.js": "x-local://wt/mypackage/handler.js" }
 * ```
 */
export function generateFilemapJson(executables: Map<string, string>): string {
  const data: FileMapData = {};

  for (const [key, value] of executables.entries()) {
    data[key] = value;
  }

  return JSON.stringify(data, null, 2);
}

/**
 * Генерирует filemap только для конкретного пакета
 *
 * @param executables - Полная карта исполняемых файлов
 * @param packageName - Имя пакета для фильтрации
 * @returns JSON-строка с данными только для указанного пакета
 */
export function generateFilemapJsonForPackage(executables: Map<string, string>, packageName: string): string {
  const data: FileMapData = {};
  const prefix = `${packageName}+`;

  for (const [key, value] of executables.entries()) {
    if (key.startsWith(prefix)) {
      data[key] = value;
    }
  }

  return JSON.stringify(data, null, 2);
}
