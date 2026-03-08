/**
 * Artifact Pipeline
 *
 * Создание архива для поставки из директории dist
 *
 * Pipeline stages:
 * 1. Validate - проверка dist, очистка/создание artifact/
 * 2. Create Archive - создание main.zip (полное содержимое dist)
 */

import { logger } from "../logger";
import { createArtifactContext } from "./context";
import { stageValidate, stageMainArchive } from "./stages";
import type { ArtifactContext, ArtifactOptions } from "./types";

// Реэкспорт типов
export type { ArtifactContext, ArtifactOptions, ZipOptions } from "./types";

/**
 * Выполняет artifact pipeline
 *
 * @param cwd - Рабочая директория
 * @param options - Опции pipeline
 * @returns Финальный контекст с информацией о созданном архиве
 */
export async function processArtifact(
  cwd: string,
  options: ArtifactOptions,
): Promise<ArtifactContext> {
  logger.info("🚀 Artifact Pipeline Started");
  logger.info("─".repeat(40));

  // Создаём начальный контекст
  let ctx = createArtifactContext(cwd, options);

  // Stage 1: Validate
  ctx = stageValidate(ctx);

  // Stage 2: Create Archive
  ctx = await stageMainArchive(ctx);

  // Summary
  logger.info("─".repeat(40));
  logger.info(`✅ Artifact Pipeline Completed`);
  logger.info(`   Архив: ${ctx.archivePath}`);

  return ctx;
}
