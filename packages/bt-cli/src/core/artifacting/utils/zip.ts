import * as fs from "fs";
import archiver from "archiver";
import type { Archiver } from "archiver";
import { logger } from "../../logger";
import type { ZipOptions } from "../types";

/**
 * Создает ZIP архив с использованием библиотеки archiver
 *
 * @param archivePath - Путь для сохранения архива
 * @param populateArchive - Функция для добавления содержимого в архив
 * @param options - Опции архивирования
 */
export async function createZipArchive(
  archivePath: string,
  populateArchive: (archive: Archiver) => void,
  options: ZipOptions = {},
): Promise<void> {
  const { compressionLevel = 9 } = options;

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const archive = archiver("zip", {
      zlib: { level: compressionLevel },
    });

    output.on("close", () => {
      resolve();
    });

    archive.on("error", (err: Error) => {
      reject(err);
    });

    archive.on("warning", (err: archiver.ArchiverError) => {
      if (err.code !== "ENOENT") {
        logger.warning(`Предупреждение при архивировании: ${err.message}`);
      }
    });

    archive.pipe(output);
    populateArchive(archive);
    archive.finalize();
  });
}

/**
 * Добавляет директорию в архив
 *
 * @param archive - Архив
 * @param dirPath - Путь к директории
 * @param archiveDirName - Имя директории внутри архива
 */
export function addDirectoryToArchive(
  archive: Archiver,
  dirPath: string,
  archiveDirName: string,
): void {
  archive.directory(dirPath, archiveDirName);
}

/**
 * Добавляет файл в архив
 *
 * @param archive - Архив
 * @param filePath - Путь к файлу
 * @param archiveFileName - Имя файла внутри архива
 */
export function addFileToArchive(
  archive: Archiver,
  filePath: string,
  archiveFileName: string,
): void {
  archive.file(filePath, { name: archiveFileName });
}
