/**
 * Linker для system пакетов (бывший bt)
 * @module linking/linkers/system
 */

import * as path from 'path';
import { PackageLinker, LinkedPackage, PackageInfo, LinkingContext } from '../types';
import { copyRecursive } from '../utils/copy';
import { copyNodeModulesWithCache } from '../utils/node-modules';

/**
 * Linker для system пакетов
 * 
 * @remarks
 * System пакеты (ранее назывались 'bt'):
 * - Уже **полностью готовы** к линковке
 * - Все необходимые файлы (init.xml, spxml/ и т.д.) уже есть в build/
 * - **Ничего не генерируется** - только копирование
 * - Режим линковки определяется через CLI флаг `--linking-system-as`:
 *   - `component` (по умолчанию): копируются в components/<ws:name>, НЕ добавляются в api_ext.xml
 *   - `standalone`: копируются по ws:root, добавляются в api_ext.xml
 * - Копируют node_modules
 * 
 * Примеры: polyfill, runtime
 */
export const systemLinker: PackageLinker = {
  type: 'system',

  link(pkg: PackageInfo, ctx: LinkingContext): LinkedPackage {
    const { sourceDir, targetPath, packageJson, projectPath, apiext, wsName } = pkg;
    const { distPath, logger, systemLinkMode, cache } = ctx;

    // Полный путь к целевой директории
    const fullTargetPath = path.join(distPath, targetPath);

    // 1. Копируем файлы пакета как есть (всё уже готово)
    copyRecursive(sourceDir, fullTargetPath);
    logger.success(`  ├─ Copied files to ${targetPath}`);

    // 2. Копируем node_modules (с кэшированием)
    copyNodeModulesWithCache({
      searchDir: projectPath,
      targetDir: fullTargetPath,
      wsName,
      cache,
      logger
    });

    logger.success(`  └─ System package linked as ${systemLinkMode}: ${packageJson.name} (ws:name=${wsName})`);

    // apiext уже определён в PackageInfo в зависимости от режима
    return {
      info: pkg,
      outputPath: fullTargetPath,
      apiext,
      generatedFiles: [] // System пакеты ничего не генерируют
    };
  }
};
