/**
 * Registry линковщиков по типам пакетов
 * @module linking/linkers
 */

import { PackageLinker, PackageType, PackageInfo, LinkingContext, LinkedPackage } from '../types';
import { standaloneLinker } from './standalone';
import { componentLinker } from './component';
import { systemLinker } from './system';

/**
 * Реестр линковщиков по типам пакетов
 */
const linkerRegistry = new Map<PackageType, PackageLinker>([
  ['standalone', standaloneLinker],
  ['component', componentLinker],
  ['system', systemLinker],
  // library не имеет линковщика - обрабатывается через node_modules
]);

/**
 * Получает линковщик для указанного типа пакета
 * 
 * @param type - Тип пакета
 * @returns Линковщик или undefined если не найден
 */
export function getLinker(type: PackageType): PackageLinker | undefined {
  return linkerRegistry.get(type);
}

/**
 * Проверяет наличие линковщика для типа пакета
 * 
 * @param type - Тип пакета
 * @returns true если линковщик существует
 */
export function hasLinker(type: PackageType): boolean {
  return linkerRegistry.has(type);
}

/**
 * Выполняет линковку пакета, выбирая нужный линковщик автоматически
 * 
 * @param pkg - Информация о пакете
 * @param ctx - Контекст линковки
 * @returns Результат линковки
 * @throws Error если линковщик для типа пакета не найден
 */
export function linkPackage(pkg: PackageInfo, ctx: LinkingContext): LinkedPackage {
  const linker = getLinker(pkg.packageType);
  
  if (!linker) {
    throw new Error(`No linker found for package type: ${pkg.packageType}`);
  }
  
  return linker.link(pkg, ctx);
}

/**
 * Возвращает список всех зарегистрированных типов пакетов с линковщиками
 */
export function getRegisteredTypes(): PackageType[] {
  return Array.from(linkerRegistry.keys());
}

// Экспорт отдельных линковщиков для прямого использования
export { standaloneLinker } from './standalone';
export { componentLinker } from './component';
export { systemLinker } from './system';
