/**
 * Утилиты для записи файлов при линковке
 * @module linking/utils/write
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Записывает файл только если содержимое изменилось
 * 
 * Сравнивает новое содержимое с существующим файлом.
 * Если файл не существует или содержимое отличается — записывает.
 * Автоматически создаёт директории.
 * 
 * @param filePath - Путь к файлу
 * @param content - Новое содержимое
 * @returns true если файл был записан, false если содержимое не изменилось
 * 
 * @example
 * ```typescript
 * if (writeIfChanged('dist/api_ext.xml', newContent)) {
 *   logger.info('api_ext.xml updated');
 * }
 * ```
 */
export function writeIfChanged(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (existing === content) {
      return false;
    }
  }
  
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

/**
 * Копирует файл только если содержимое изменилось
 * 
 * @param srcPath - Путь к исходному файлу
 * @param dstPath - Путь к целевому файлу
 * @returns true если файл был скопирован, false если содержимое не изменилось
 */
export function copyIfChanged(srcPath: string, dstPath: string): boolean {
  const content = fs.readFileSync(srcPath);
  
  if (fs.existsSync(dstPath)) {
    const existing = fs.readFileSync(dstPath);
    if (content.equals(existing)) {
      return false;
    }
  }
  
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.copyFileSync(srcPath, dstPath);
  return true;
}
