/**
 * Типы для модуля linking
 * @module linking/types
 */

import type { DependencyNode } from "./dependencies";
import type { logger } from "../logger";

/**
 * Тип логгера (typeof logger из core/logger)
 */
export type Logger = typeof logger;

/**
 * Тип BorisType пакета
 * - standalone: самостоятельный модуль, инициализируется через api_ext.xml
 * - component: компонент платформы, инициализируется через spxml/
 * - system: системный пакет (бывший bt), готов к линковке без генерации
 * - library: библиотека, копируется в node_modules
 */
export type PackageType = "standalone" | "component" | "system" | "library";

/**
 * Конфигурация API extension для api_ext.xml
 */
export type ApiExtEntry = {
  /** Имя модуля (например "module:myapp") */
  name: string;
  /** Список путей к библиотекам */
  libs: string[];
};

/**
 * Информация о пакете для линковки
 */
export type PackageInfo = {
  /** Исходный DependencyNode (если есть) */
  dependencyNode?: DependencyNode;
  /** Содержимое package.json */
  packageJson: Record<string, any>;
  /** Тип пакета */
  packageType: PackageType;
  /**
   * Имя пакета для использования в путях и api_ext (из ws:name)
   * Это "чистое" имя без scope (например "runtime" вместо "@boristype/runtime")
   */
  wsName: string;
  /** Путь к директории проекта */
  projectPath: string;
  /** Путь к source директории (build/) */
  sourceDir: string;
  /** Целевой путь относительно dist/ */
  targetPath: string;
  /** URL для x-local:// */
  rootUrl: string;
  /** Конфигурация для api_ext.xml (если есть) */
  apiext?: ApiExtEntry;
  /** Нужно ли генерировать init файлы */
  needsInitGeneration: boolean;
};

/**
 * Результат линковки пакета
 */
export type LinkedPackage = {
  /** Информация о пакете */
  info: PackageInfo;
  /** Полный путь к директории пакета в dist */
  outputPath: string;
  /** Конфигурация для api_ext.xml (если есть) */
  apiext?: ApiExtEntry;
  /** Список сгенерированных файлов */
  generatedFiles: string[];
};

// Forward declaration для избежания циклических импортов
import type { LinkingCache } from "./cache";

/**
 * Контекст линковки - общее состояние для всех этапов
 */
export type LinkingContext = {
  /** Корневая директория проекта */
  projectPath: string;
  /** Путь к директории dist */
  distPath: string;
  /** Режим линковки system пакетов */
  systemLinkMode: "standalone" | "component";
  /** Кэш линковки */
  cache: LinkingCache;
  /** Слинкованные пакеты */
  linkedPackages: LinkedPackage[];
  /** Записи для api_ext.xml */
  apiExtEntries: ApiExtEntry[];
  /** Глобальные executables для filemap */
  executables: Map<string, string>;
  /** Logger для вывода сообщений */
  logger: Logger;
  /** Режим dev (инкрементальная линковка) */
  devMode: boolean;
  /** Изменённые файлы (абсолютные пути в build/) — только для devMode */
  changedFiles: string[];
};

/**
 * Интерфейс линковщика для конкретного типа пакета
 */
export interface PackageLinker {
  /** Тип пакета который обрабатывает этот линковщик */
  readonly type: PackageType;

  /**
   * Выполняет линковку пакета
   * @param pkg - Информация о пакете
   * @param ctx - Контекст линковки
   * @returns Результат линковки
   */
  link(pkg: PackageInfo, ctx: LinkingContext): LinkedPackage;
}

/**
 * Режим линковки system пакетов
 * - standalone: регистрируются в api_ext.xml
 * - component: НЕ регистрируются в api_ext.xml (своя логика загрузки)
 */
export type SystemLinkMode = "standalone" | "component";

/**
 * Информация о найденной библиотеке в node_modules
 */
export type DiscoveredLibrary = {
  /** Полное имя пакета (например "@scope/lib" или "my-lib") */
  name: string;
  /** Реальный путь к директории библиотеки (resolved через symlink) */
  realPath: string;
  /** Путь в исходном node_modules (может быть symlink) */
  sourcePath: string;
  /** Является ли пакет локальным (symlink → workspace/file dependency) */
  isLocal: boolean;
};

/**
 * Запись кэша для отдельной библиотеки в node_modules
 */
export type LibraryCacheEntry = {
  /** SHA256 hash содержимого библиотеки (только для локальных пакетов) */
  contentHash: string;
  /** Является ли пакет локальным (symlink) */
  isLocal: boolean;
};

/**
 * Информация о кэше node_modules для пакета
 */
export type NodeModulesCacheEntry = {
  /** Hash от lockfile (package-lock.json / pnpm-lock.yaml) */
  lockfileHash: string;
  /** Per-library кэш для отслеживания изменений в локальных пакетах */
  libraries: Record<string, LibraryCacheEntry>;
  /** Время последней линковки node_modules */
  linkedAt: string;
  /** Версия формата кэша */
  version: number;
};

/**
 * Состояние кэша линковки
 */
export type LinkingCacheState = {
  /** Версия формата кэша */
  version: number;
  /** Кэш node_modules по ws:name пакетов */
  nodeModules: Record<string, NodeModulesCacheEntry>;
};

/**
 * Опции для линковки
 */
export type LinkingOptions = {
  /** Очистить dist и кэш перед линковкой */
  clean?: boolean;
  /** Не использовать кэш (но не удалять его) */
  noCache?: boolean;
  /** Режим линковки system пакетов (по умолчанию 'component') */
  systemLinkMode?: SystemLinkMode;
  /** Режим dev (инкрементальная линковка) */
  devMode?: boolean;
  /** Изменённые файлы (абсолютные пути в build/) — только для devMode */
  changedFiles?: string[];
  /** Пропустить линковку system-пакетов (runtime управляется извне) */
  externalRuntime?: boolean;
};
