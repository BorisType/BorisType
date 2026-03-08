import * as path from "path";
import type { ArtifactContext, ArtifactOptions } from "./types";

/**
 * Создаёт начальный контекст для artifact pipeline
 *
 * @param cwd - Рабочая директория
 * @param options - Опции pipeline
 * @returns Начальный контекст
 */
export function createArtifactContext(cwd: string, options: ArtifactOptions): ArtifactContext {
  const distPath = path.join(cwd, "dist");
  const artifactPath = path.join(cwd, "artifact");

  return {
    cwd,
    distPath,
    artifactPath,
    options,
  };
}
