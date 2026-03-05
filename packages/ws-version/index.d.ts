/**
 * Преобразует semver версию в формат целевой системы (4 компонента)
 * @param version - Версия в формате semver
 * @returns Версия в формате x.y.z.w
 * @throws {Error} Если версия невалидна или содержит компоненты > 999
 */
export function convertSemverToWsVersion(version: string): string;

/**
 * Сравнивает две версии в ws-формате 
 * @param version1 - Первая версия
 * @param version2 - Вторая версия  
 * @returns Результат сравнения (-1 если v1 < v2, 0 если равны, 1 если v1 > v2)
 */
export function compareWsVersions(version1: string, version2: string): -1 | 0 | 1;

/**
 * Проверяет валидность ws-версии
 * @param version - Версия для проверки
 * @returns true если версия валидна
 */
export function isValidWsVersion(version: string): boolean;

/**
 * Кодирует prerelease информацию в число, сохраняя порядок сортировки
 * @param prerelease - Массив prerelease компонентов
 * @returns Закодированный номер
 */
export function encodePrereleaseToNumber(prerelease: readonly (string | number)[]): number;

/**
 * Преобразует промежуток версий semver в формат ws
 * @param range - Промежуток версий в формате semver (например, "^1.2.3", "~1.2.3", "*")
 * @returns Промежуток версий в формате ws
 * @throws {Error} Если промежуток невалиден
 */
export function convertSemverRangeToWsRange(range: string): string;

/**
 * Проверяет валидность ws-промежутка версий
 * @param range - Промежуток версий для проверки
 * @returns true если промежуток валиден
 */
export function isValidWsRange(range: string): boolean;

/**
 * Тип для версии в ws-формате
 */
export type WsVersion = string;

/**
 * Тип для промежутка версий в ws-формате
 */
export type WsVersionRange = string;

/**
 * Опции для преобразования версий
 */
export interface ConversionOptions {
  /** Максимальное значение для компонентов (по умолчанию 999) */
  maxComponentValue?: number;
  /** Строгая проверка semver */
  strict?: boolean;
}