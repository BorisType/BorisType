/**
 * Утилиты для копирования файлов и директорий
 * @module linking/utils/copy
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Рекурсивно копирует файлы и папки
 *
 * @param source - Путь к исходному файлу или директории
 * @param target - Путь к целевому файлу или директории
 *
 * @remarks
 * - Следует по symlink (использует fs.statSync вместо fs.lstatSync)
 * - Создаёт целевые директории автоматически
 * - Копирует файлы и поддиректории рекурсивно
 */
export function copyRecursive(source: string, target: string): void {
  // Используем fs.statSync чтобы следовать по symlink если это ссылка
  const stats = fs.statSync(source);

  if (stats.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });

    const items = fs.readdirSync(source);

    for (const itemName of items) {
      const sourcePath = path.join(source, itemName);
      const targetPath = path.join(target, itemName);

      // Используем fs.statSync чтобы следовать по symlink
      const itemStats = fs.statSync(sourcePath);
      if (itemStats.isDirectory()) {
        copyRecursive(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  } else {
    // Если source это файл (или symlink на файл), просто копируем
    fs.copyFileSync(source, target);
  }
}

/**
 * Копирует все содержимое папки в другую папку с добавлением префикса к относительным путям
 *
 * @param sourceDir - Исходная папка
 * @param targetDir - Целевая папка
 * @param pathPrefix - Префикс для относительных путей (например: './wt/test')
 *
 * @example
 * ```ts
 * // Копирует содержимое /src/build в /dist/wt/mypackage
 * copyWithPrefix('/src/build', '/dist', './wt/mypackage');
 * ```
 */
export function copyWithPrefix(sourceDir: string, targetDir: string, pathPrefix: string): void {
  // Нормализуем пути
  const normalizedSource = path.normalize(sourceDir);
  const normalizedTarget = path.normalize(targetDir);
  const normalizedPrefix = path.normalize(pathPrefix);

  // Создаем целевую папку с учетом префикса
  const targetWithPrefix = path.join(normalizedTarget, normalizedPrefix);

  // Рекурсивно копируем содержимое
  copyRecursive(normalizedSource, targetWithPrefix);
}
