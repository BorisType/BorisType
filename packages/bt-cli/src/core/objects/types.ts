/**
 * Типы для модуля platform objects sync
 * @module objects/types
 */

// ─── Server Query Types (Phase 2) ──────────────────────────────

/**
 * Запись из таблицы spxml_objects.
 * Возвращается server list query.
 */
export type SpxmlObjectRecord = {
  /** ID объекта (bigint → string) */
  id: string;
  /** Тип каталога: server_agent, group, ... */
  form: string;
  /** Дата последней модификации */
  modified: string;
};

/**
 * Полные данные объекта: запись из spxml_objects + XML.
 * Получается после list + fetch.
 */
export type FetchedObject = {
  /** Данные из spxml_objects */
  record: SpxmlObjectRecord;
  /** Полный XML документа */
  xml: string;
};

// ─── Client Processing Types (Phase 3) ─────────────────────────

/**
 * Метаданные, извлечённые из XML на клиенте.
 * doc_info и другие поля парсятся из XML локально.
 */
export type ObjectMetadata = {
  /** ID объекта */
  id: string;
  /** Тип каталога (из record.form) */
  type: string;
  /** Человекочитаемое название (из XML \<name\>) */
  name: string;
  /** Дата модификации (из record.modified) */
  modifiedDate: string;
  /** Автор последней модификации (из XML doc_info.modification_author_login) */
  modificationAuthor: string;
};

/**
 * Результат обработки одного объекта.
 * Содержит всю информацию для UI и записи.
 */
export type ObjectChange = {
  /** Метаданные, извлечённые из XML */
  metadata: ObjectMetadata;
  /** Полный XML (уже скачан) */
  xml: string;
  /** Нормализованный XML для сравнения (volatile fields stripped) */
  normalizedXml: string;
  /** Статус изменения */
  status: "new" | "modified" | "unchanged";
  /** "ours" = автор совпадает с username, "theirs" = чужой */
  ownership: "ours" | "theirs";
  /** Пакет, в котором объект уже существует (null для new) */
  existingPackage: string | null;
  /** Путь к существующему файлу (null для new) */
  existingPath: string | null;
  /** Hash нормализованного remote XML */
  remoteHash: string;
  /** Hash нормализованного local XML (null для new) */
  localHash: string | null;
};

/**
 * Итог client-side processing → вход для interactive UI.
 */
export type ChangeSet = {
  /** Объекты с реальными изменениями (new + modified) */
  changes: ObjectChange[];
  /** Объекты без реальных изменений (unchanged после hash compare) */
  unchanged: ObjectChange[];
  /** Объекты отфильтрованные по типу */
  filteredByType: FetchedObject[];
  /** Доступные пакеты для назначения */
  availablePackages: string[];
};

// ─── Interactive UI Types (Phase 4) ─────────────────────────────

/**
 * Выбранный объект после interactive UI.
 */
export type SelectedObject = {
  /** Данные об изменении */
  change: ObjectChange;
  /** Целевой пакет (existing или назначенный пользователем) */
  targetPackage: string;
};

/**
 * Результат interactive UI.
 */
export type SelectionResult = {
  /** Объекты для записи */
  selected: SelectedObject[];
  /** Пропущенные пользователем */
  skipped: ObjectChange[];
};

// ─── File I/O Types (Phase 5) ───────────────────────────────────

/**
 * Результат записи одного объекта на диск.
 */
export type WrittenFile = {
  /** ID объекта */
  objectId: string;
  /** Относительный путь: backend/objects/server_agent/6EA83B2F00A4B.xml */
  relativePath: string;
  /** Действие */
  action: "created" | "updated";
};

/**
 * Структура .btc/objects-cache.json
 */
export type ObjectsCache = {
  /** Дата последней успешной синхронизации (ISO 8601) */
  lastSync: string;
  /** Индекс известных объектов: id → метаданные */
  objects: Record<
    string,
    {
      type: string;
      package: string;
    }
  >;
};

// ─── Config Types ───────────────────────────────────────────────

/**
 * Типы объектов, исключаемые по умолчанию при pull.
 * Пользователь может расширить список через btconfig.json → objects.exclude.
 */
export const DEFAULT_EXCLUDE_TYPES: readonly string[] = ["collaborator"];

/**
 * Секция objects в btconfig.json
 */
export type BtConfigObjects = {
  /** Дополнительные типы объектов для исключения (добавляются к DEFAULT_EXCLUDE_TYPES) */
  exclude?: string[];
};
