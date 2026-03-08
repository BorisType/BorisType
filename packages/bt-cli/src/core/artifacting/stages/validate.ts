import * as fs from "fs";
import { logger } from "../../logger";
import type { ArtifactContext } from "../types";

/**
 * Stage 1: Валидация и подготовка
 *
 * - Проверяет существование директории dist
 * - Очищает или создаёт директорию artifact
 *
 * @param ctx - Контекст artifact pipeline
 * @returns Контекст (без изменений)
 * @throws Error если dist не существует
 */
export function stageValidate(ctx: ArtifactContext): ArtifactContext {
  logger.info("📋 Stage: Validate");

  // Проверяем существование директории dist
  if (!fs.existsSync(ctx.distPath)) {
    logger.error(`Директория dist не найдена: ${ctx.distPath}`);
    throw new Error("Directory dist does not exist");
  }
  logger.info(`  ✓ Директория dist найдена`);

  // Очищаем или создаём директорию artifact
  if (ctx.options.clean && fs.existsSync(ctx.artifactPath)) {
    fs.rmSync(ctx.artifactPath, { recursive: true, force: true });
    logger.info(`  ✓ Директория artifact очищена`);
  }

  if (!fs.existsSync(ctx.artifactPath)) {
    fs.mkdirSync(ctx.artifactPath, { recursive: true });
    logger.info(`  ✓ Создана директория artifact`);
  } else {
    logger.info(`  ✓ Директория artifact существует`);
  }

  return ctx;
}
