/**
 * Генератор api_ext.xml
 * @module linking/generators/api-ext
 */

import { xmlBuilderKeepEmpty } from '../../utils/xml';
import { ApiExtEntry } from '../types';

/**
 * Генерирует содержимое api_ext.xml файла
 * 
 * @param entries - Массив записей для api_ext.xml
 * @returns Содержимое api_ext.xml файла
 * 
 * @remarks
 * api_ext.xml содержит список модулей и их библиотек (libs).
 * Создаётся один раз для всего проекта в dist/source/api_ext.xml.
 * 
 * Структура:
 * ```xml
 * <api_ext>
 *   <apis>
 *     <api>
 *       <name>module:mypackage</name>
 *       <libs>
 *         <lib><path>x-local://wt/mypackage/init.xml</path></lib>
 *       </libs>
 *     </api>
 *   </apis>
 * </api_ext>
 * ```
 * 
 * @example
 * ```ts
 * const entries = [
 *   { name: 'module:polyfill', libs: ['x-local://wt/polyfill/init.xml'] },
 *   { name: 'module:myapp', libs: ['x-local://wt/myapp/init.xml'] }
 * ];
 * const xml = buildApiExt(entries);
 * ```
 */
export function buildApiExt(entries: ApiExtEntry[]): string {
  const xmlObj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'utf-8' },
    'api_ext': {
      'apis': {
        'api': entries.map(entry => ({
          'name': entry.name,
          'libs': {
            'lib': entry.libs.map(libPath => ({ 'path': libPath })),
          },
        })),
      },
    },
  };

  return xmlBuilderKeepEmpty.build(xmlObj);
}
