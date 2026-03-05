/**
 * Конфигурация проекта — tsconfig.json и btconfig.json
 *
 * Единый модуль для чтения, парсинга и генерации конфигурационных файлов.
 * Также содержит типы для btconfig.json.
 *
 * @module core/config
 */

import ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from './utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────

/**
 * Базовые свойства пакета для линковки.
 * Используется как для отдельных пакетов в packages[], так и для корневого linking.
 */
export type BtConfigLinkingPackageBase = {
  /**
   * Имя пакета.
   * Для packages[]: соответствует директории (например: "backend", "frontend").
   * Для корневого linking: переопределяет ws:name из package.json.
   */
  name?: string;

  /**
   * Путь к source директории (опционально).
   *
   * Для BorisType пакетов (ws:package):
   * - Если указан: используется указанный путь (приоритет)
   * - Если не указан: используется ./build (по умолчанию)
   *
   * Для обычных директорий (нет ws:package):
   * - ОБЯЗАТЕЛЬНО должен быть указан
   */
  source?: string;

  /**
   * Целевой путь внутри dist/ (опционально).
   *
   * Для BorisType пакетов (ws:package):
   * - Если указан: используется указанный путь (приоритет)
   * - Если не указан: используется ws:root из package.json (fallback)
   * - Если ни то, ни другое: используется ./wt/{ws:name}
   *
   * Для обычных директорий (нет ws:package):
   * - ОБЯЗАТЕЛЬНО должен быть указан
   */
  target?: string;
};

/**
 * Описание отдельного пакета для линковки в packages[].
 * name обязателен для дочерних пакетов.
 */
export type BtConfigLinkingPackage = BtConfigLinkingPackageBase & {
  /**
   * Путь к директории пакета относительно корня проекта.
   * ОБЯЗАТЕЛЬНО для пакетов в packages[].
   * Например: ".", "backend", "frontend", "packages/shared"
   *
   * "." означает текущую директорию (корень проекта)
   */
  name: string;
};

/**
 * Секция linking в btconfig.json.
 *
 * Может быть в двух режимах:
 * 1. Простой режим (текущий проект как единственный пакет):
 *    `{ "linking": { "source": "./build", "target": "./wt/myapp" } }`
 *
 * 2. Multi-package режим (несколько дочерних пакетов):
 *    `{ "linking": { "packages": [...] } }`
 *
 * Режимы взаимоисключающие: либо packages, либо другие свойства.
 */
export type BtConfigLinking = BtConfigLinkingPackageBase & {
  /**
   * Список дочерних пакетов для линковки.
   * Если указан, другие свойства (name, source, target) игнорируются.
   */
  packages?: BtConfigLinkingPackage[];
};

/**
 * Полная структура btconfig.json
 */
export type BtConfig = {
  /** JSON Schema URI (опционально, для IDE поддержки) */
  $schema?: string;
  /** Конфигурация линковки */
  linking?: BtConfigLinking;
};

// ─── tsconfig.json ──────────────────────────────────────────────

/**
 * Читает и парсит tsconfig.json.
 *
 * @param cwd - Рабочая директория для поиска tsconfig
 * @param project - Имя файла конфигурации (по умолчанию tsconfig.json)
 * @returns Распарсенная конфигурация TypeScript
 */
export function getTSConfig(cwd: string, project: string = 'tsconfig.json'): ts.ParsedCommandLine {
  const tsconfigPath = ts.findConfigFile(cwd, ts.sys.fileExists, project);

  if (!tsconfigPath) {
    logger.error(`There is no any configuration files at "${cwd}". Execute npx tsc -init to create a new one.`);
    process.exit(1);
  }

  const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

  if (error) {
    logger.error(error.messageText.toString());
    process.exit(1);
  }

  // Используем директорию tsconfig.json как базу для резолва путей
  const configDir = path.dirname(tsconfigPath);
  const configFileContent = ts.parseJsonConfigFileContent(config, ts.sys, configDir);

  if (configFileContent.errors.length > 0) {
    configFileContent.errors.forEach(diagnostic => {
      logger.error(diagnostic.messageText.toString());
    });

    process.exit(1);
  }

  return configFileContent;
}

/**
 * Генерирует tsconfig.json с дефолтными настройками для BorisType проекта.
 *
 * @param cwd - Рабочая директория (по умолчанию process.cwd())
 * @returns true если файл создан, false если уже существует
 */
export function generateDefaultTSConfig(cwd: string = process.cwd()): boolean {
  const tsconfigContent = `{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "Bundler",
    "rootDir": "./src/",
    "outDir": "./build/",
    "strict": true,
    "noImplicitAny": true,
    "allowJs": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noLib": true,
    "typeRoots": [
      "node_modules/@boristype/types/lib",
      "node_modules/@boristype/types/lib/xml"
    ]
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules"
  ]
}
`;

  const tsconfigPath = path.join(cwd, 'tsconfig.json');

  if (fs.existsSync(tsconfigPath)) {
    logger.warning('⚠️  tsconfig.json already exists. Skipping generation.');
    return false;
  }

  try {
    fs.writeFileSync(tsconfigPath, tsconfigContent, 'utf8');
    logger.success('Created a new tsconfig.json');
    return true;
  } catch (error) {
    logger.error('❌ Failed to create tsconfig.json');
    throw error;
  }
}

// ─── btconfig.json ──────────────────────────────────────────────

/**
 * Читает и парсит btconfig.json.
 *
 * @param cwd - Рабочая директория
 * @param project - Имя файла конфигурации (по умолчанию btconfig.json)
 * @returns Объект конфигурации BtConfig или undefined если файл не найден
 */
export function getBTConfig(cwd: string, project: string = 'btconfig.json'): BtConfig | undefined {
  const btconfigPath = path.join(cwd, project);

  if (!fs.existsSync(btconfigPath)) {
    return undefined;
  }

  try {
    const configContent = fs.readFileSync(btconfigPath, 'utf-8');
    const config: BtConfig = JSON.parse(configContent);
    return config;
  } catch (error) {
    logger.error(`Error reading or parsing ${project}: ${error}`);
    process.exit(1);
  }
}
