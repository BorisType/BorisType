import { getTSConfig, getBTConfig } from "../../core/config.js";
import { BuildPipeline } from "../../core/building/index.js";
import type { BtcCompileOptions } from "../../core/building/types.js";

/**
 * Команда build - транспиляция TypeScript в BorisScript
 *
 * @param files - Список файлов для компиляции (пустой = все файлы из tsconfig)
 * @param options - Опции компиляции
 */
export async function buildCommand(files: string[], options: BtcCompileOptions): Promise<void> {
  const cwd = process.cwd();

  const tsConfig = getTSConfig(cwd, "tsconfig.json");
  const _btConfig = getBTConfig(cwd, "btconfig.json"); // TODO: использовать в будущем

  const result = BuildPipeline.run({
    tsConfig,
    options,
    files,
    cwd,
  });

  if (!result.success) {
    process.exitCode = 1;
  }
}
