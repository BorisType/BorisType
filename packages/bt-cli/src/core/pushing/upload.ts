/**
 * Загрузка dist на WSHCM сервер
 *
 * @module core/pushing/upload
 */

import { Evaluator, WshcmUploader, type UploadProgressCallback } from "@boristype/ws-client";
import { logger } from "../logger";

/**
 * Загружает содержимое dist директории на WSHCM сервер
 *
 * Использует переданный evaluator для всех серверных операций.
 * Lifecycle evaluator-а управляется вызывающим кодом.
 *
 * @param evaluator - инициализированный evaluator
 * @param distPath - путь к папке dist
 * @param onProgress - callback для отслеживания прогресса загрузки
 * @returns массив URL загруженных файлов
 */
export async function uploadDist(evaluator: Evaluator, distPath: string, onProgress?: UploadProgressCallback): Promise<string[]> {
  const uploader = new WshcmUploader({
    evaluator,
    path: distPath + "/*",
    destination: "x-local://",
  });

  await uploader.prepare();
  await uploader.upload(
    onProgress ??
      ((uploaded: number, total: number) => {
        logger.info(`📦 Progress: ${((uploaded / total) * 100).toFixed(2)}%`);
      }),
  );
  const urls = await uploader.finish();

  logger.info(`✅ Uploaded ${urls.length} file(s)`);
  return urls;
}
