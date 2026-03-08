import * as fs from "fs";
import * as path from "path";
import { logger } from "../../logger";
import { createZipArchive, addDirectoryToArchive, addFileToArchive } from "../utils/zip";
import type { ArtifactContext } from "../types";

/**
 * Stage 2: Создание полного архива дистрибуции
 *
 * Создаёт main.zip со всем содержимым dist
 *
 * @param ctx - Контекст artifact pipeline
 * @returns Обновлённый контекст с путём к архиву
 */
export async function stageMainArchive(ctx: ArtifactContext): Promise<ArtifactContext> {
  logger.info("📦 Stage: Create Archive");

  const archiveName = "main.zip";
  const archivePath = path.join(ctx.artifactPath, archiveName);

  logger.info(`  → Создание архива: ${archiveName}`);

  await createZipArchive(archivePath, (archive) => {
    const items = fs.readdirSync(ctx.distPath);

    for (const item of items) {
      const itemPath = path.join(ctx.distPath, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        addDirectoryToArchive(archive, itemPath, item);
      } else {
        addFileToArchive(archive, itemPath, item);
      }
    }
  });

  logger.info(`  ✓ Создан: ${archiveName}`);

  return {
    ...ctx,
    archivePath,
  };
}
