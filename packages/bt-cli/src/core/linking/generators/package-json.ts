/**
 * Генератор package.json для компонентов
 * @module linking/generators/package-json
 */

/**
 * Информация о компоненте для генерации package.json
 */
export interface ComponentPackageInfo {
  /** Имя компонента */
  name: string;
  /** Версия компонента */
  version?: string;
  /** Описание компонента */
  description?: string;
}

/**
 * Структура package.json компонента
 */
export interface ComponentPackageJson {
  name: string;
  version: string;
  description: string;
  enableByDefault: boolean;
  dependencies: Record<string, string>;
  type: string;
  tags: string[];
}

/**
 * Генерирует package.json для компонента
 * 
 * @param info - Информация о компоненте
 * @returns Объект package.json для компонента
 * 
 * @remarks
 * Компоненты имеют специфичный формат package.json:
 * - enableByDefault: true
 * - type: 'standard'
 * - tags: ['#public']
 * - dependencies: {} (пустой)
 * 
 * @example
 * ```ts
 * const pkgJson = buildComponentPackageJson({
 *   name: 'my-component',
 *   version: '1.0.0',
 *   description: 'My awesome component'
 * });
 * ```
 */
export function buildComponentPackageJson(info: ComponentPackageInfo): ComponentPackageJson {
  return {
    name: info.name || 'unknown',
    version: info.version || '1.0.0.0',
    description: info.description || info.name || 'unknown',
    enableByDefault: true,
    dependencies: {
      "bt-runtime":"^0.0.0.0",
    },
    type: 'standard',
    tags: ['#public']
  };
}

/**
 * Генерирует package.json как JSON-строку
 * 
 * @param info - Информация о компоненте
 * @returns JSON-строка package.json
 */
export function buildComponentPackageJsonString(info: ComponentPackageInfo): string {
  return JSON.stringify(buildComponentPackageJson(info), null, 2);
}
