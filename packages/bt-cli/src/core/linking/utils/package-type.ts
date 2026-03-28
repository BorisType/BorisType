/**
 * Утилиты для работы с типами пакетов
 * @module linking/utils/package-type
 */

import { PackageType } from "../types";

/**
 * Маппинг устаревших типов пакетов на новые
 * Поддерживает обратную совместимость со старыми конфигурациями
 */
const LEGACY_TYPE_MAPPING: Record<string, PackageType> = {
  app: "standalone",
  lib: "library",
  bt: "system", // bt переименован в system
};

/**
 * Валидные типы пакетов
 */
const VALID_PACKAGE_TYPES: readonly PackageType[] = ["standalone", "component", "library", "system"];

/**
 * Нормализует тип пакета, мапит старые значения на новые для обратной совместимости
 *
 * @param wsPackage - значение ws:package из package.json
 * @returns нормализованный тип или null если не является BT пакетом
 *
 * @example
 * ```ts
 * normalizePackageType('app')       // -> 'standalone'
 * normalizePackageType('lib')       // -> 'library'
 * normalizePackageType('bt')        // -> 'system'
 * normalizePackageType('standalone') // -> 'standalone'
 * normalizePackageType(undefined)   // -> null
 * normalizePackageType('invalid')   // -> null
 * ```
 */
export function normalizePackageType(wsPackage: string | undefined): PackageType | null {
  if (!wsPackage) {
    return null;
  }

  // Проверяем маппинг устаревших типов
  if (LEGACY_TYPE_MAPPING[wsPackage]) {
    return LEGACY_TYPE_MAPPING[wsPackage];
  }

  // Проверяем валидные типы
  if (VALID_PACKAGE_TYPES.includes(wsPackage as PackageType)) {
    return wsPackage as PackageType;
  }

  return null;
}

/**
 * Проверяет, является ли тип пакета исполняемым (требует полной линковки)
 *
 * @param packageType - тип пакета
 * @returns true если пакет требует полной линковки
 *
 * @remarks
 * - standalone, component, system - полная линковка (node_modules, init.xml/spxml, api_ext.xml)
 * - library - только копирование в node_modules родительского пакета
 *
 * @example
 * ```ts
 * isExecutablePackageType('standalone') // -> true
 * isExecutablePackageType('component')  // -> true
 * isExecutablePackageType('system')     // -> true
 * isExecutablePackageType('library')    // -> false
 * ```
 */
export function isExecutablePackageType(packageType: PackageType): boolean {
  return packageType === "standalone" || packageType === "component" || packageType === "system";
}

/**
 * Возвращает список всех валидных типов пакетов
 */
export function getValidPackageTypes(): readonly PackageType[] {
  return VALID_PACKAGE_TYPES;
}

/**
 * Возвращает список всех устаревших типов пакетов (для сообщений об ошибках)
 */
export function getLegacyPackageTypes(): string[] {
  return Object.keys(LEGACY_TYPE_MAPPING);
}

/**
 * Форматирует список валидных типов для вывода в сообщения об ошибках
 *
 * @example
 * ```ts
 * formatValidPackageTypes()
 * // -> 'standalone, component, system, library (or legacy: app, lib, bt)'
 * ```
 */
export function formatValidPackageTypes(): string {
  const validTypes = VALID_PACKAGE_TYPES.join(", ");
  const legacyTypes = Object.keys(LEGACY_TYPE_MAPPING).join(", ");
  return `${validTypes} (or legacy: ${legacyTypes})`;
}
