/**
 * Генераторы для linking модуля
 * @module linking/generators
 */

export { buildInitXml } from './init-xml';
export { buildComponentXml, buildComponentJs, buildComponentFiles, type ComponentFiles } from './component';
export { buildApiExt } from './api-ext';
export { generateFilemapJson, generateFilemapJsonForPackage, type FileMapData } from './filemap';
export { 
  buildComponentPackageJson, 
  buildComponentPackageJsonString,
  type ComponentPackageInfo,
  type ComponentPackageJson 
} from './package-json';
