import { generateDefaultTSConfig } from "../../core/config";
import { logger } from "../../core/logger";

/**
 * Команда init - инициализация BorisType проекта
 * Создаёт tsconfig.json с настройками по умолчанию
 */
export async function initCommand(): Promise<void> {
  const cwd = process.cwd();

  logger.info("🚀 Initializing BorisType project...");
  generateDefaultTSConfig(cwd);
  logger.success("✅ Project initialized successfully");
}
