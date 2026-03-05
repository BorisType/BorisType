import { processArtifact } from '../../core/artifacting';

/**
 * Опции команды artifact
 */
export type ArtifactCommandOptions = {
  /** Очистить директорию artifact перед созданием архивов */
  clean?: boolean;
}

/**
 * Команда artifact - создание архивов для поставки
 * Создаёт zip-архив из директории dist
 * 
 * @param options - Опции команды
 */
export async function artifactCommand(options: ArtifactCommandOptions = {}): Promise<void> {
  const cwd = process.cwd();
  await processArtifact(cwd, { clean: options.clean ?? false });
}
