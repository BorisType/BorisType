/**
 * Generic .properties file parser
 *
 * Формат: key=value, одна пара на строку.
 * Строки начинающиеся с `#` — комментарии.
 * Пустые строки игнорируются.
 *
 * @module core/utils/properties
 */

import * as fs from 'node:fs';

/**
 * Парсит содержимое в формате `.properties` (key=value).
 *
 * @param content - текстовое содержимое файла
 * @returns объект ключ-значение
 */
export function parseProperties(content: string): Record<string, string> {
  const lines = content.split(/\r?\n/);
  const result: Record<string, string> = {};

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue;
    }
    const [key, value] = trimmedLine.split('=', 2);
    if (key && value !== undefined) {
      result[key.trim()] = value.trim();
    }
  }

  return result;
}

/**
 * Читает и парсит `.properties` файл.
 *
 * @param filePath - абсолютный путь к файлу
 * @returns объект ключ-значение, или пустой объект если файл не существует
 */
export function parsePropertiesFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) {
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseProperties(content);
}
