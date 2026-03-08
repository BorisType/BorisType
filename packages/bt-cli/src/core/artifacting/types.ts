/**
 * Типы для модуля artifact
 * Создание архивов для поставки
 */

/**
 * Опции для artifact pipeline
 */
export type ArtifactOptions = {
  /** Очистить директорию artifact перед созданием */
  clean: boolean;
};

/**
 * Контекст выполнения artifact pipeline
 */
export type ArtifactContext = {
  /** Рабочая директория */
  cwd: string;
  /** Путь к директории dist */
  distPath: string;
  /** Путь к директории artifact */
  artifactPath: string;
  /** Опции pipeline */
  options: ArtifactOptions;
  /** Путь к созданному архиву */
  archivePath?: string;
};

/**
 * Опции для создания ZIP архива
 */
export type ZipOptions = {
  /** Уровень сжатия (0-9) */
  compressionLevel?: number;
};
