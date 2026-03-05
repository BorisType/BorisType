/**
 * Linker для standalone пакетов
 * @module linking/linkers/standalone
 */

import * as fs from 'fs';
import * as path from 'path';
import { PackageLinker, LinkedPackage, PackageInfo, LinkingContext, ApiExtEntry } from '../types';
import { copyRecursive } from '../utils/copy';
import { copyNodeModulesWithCache } from '../utils/node-modules';
import { writeIfChanged } from '../utils/write';
import { buildInitXml } from '../generators/init-xml';
import { generateFilemapJson } from '../generators/filemap';

/**
 * Linker для standalone пакетов
 * 
 * @remarks
 * Standalone пакеты:
 * - Генерируют init.xml
 * - Генерируют .filemap.json (per-module)
 * - Регистрируются в api_ext.xml
 * - Копируют node_modules (с кэшированием)
 */
export const standaloneLinker: PackageLinker = {
  type: 'standalone',

  link(pkg: PackageInfo, ctx: LinkingContext): LinkedPackage {
    const { sourceDir, targetPath, packageJson, rootUrl, projectPath, wsName } = pkg;
    const { distPath, executables, logger, cache, devMode, changedFiles } = ctx;

    const generatedFiles: string[] = [];

    // Полный путь к целевой директории
    const fullTargetPath = path.join(distPath, targetPath);

    // 1. Копируем файлы пакета
    if (devMode && changedFiles.length > 0) {
      // Инкрементальное копирование — только изменённые файлы
      for (const srcFile of changedFiles) {
        const relativePath = path.relative(sourceDir, srcFile);
        // Пропускаем файлы не из sourceDir (например, из другого пакета)
        if (relativePath.startsWith('..')) {
          continue;
        }
        const dstFile = path.join(fullTargetPath, relativePath);
        fs.mkdirSync(path.dirname(dstFile), { recursive: true });
        fs.copyFileSync(srcFile, dstFile);
      }
      logger.success(`  ├─ Copied ${changedFiles.length} changed file(s) to ${targetPath}`);
    } else {
      // Полное копирование
      copyRecursive(sourceDir, fullTargetPath);
      logger.success(`  ├─ Copied files to ${targetPath}`);
    }

    // 2. Копируем node_modules (с кэшированием) — только при полной линковке
    if (!devMode) {
      copyNodeModulesWithCache({
        searchDir: projectPath,
        targetDir: fullTargetPath,
        wsName,
        cache,
        logger
      });
    }

    // 3. Создаём init.xml (только если его нет в build/)
    const mainFile = packageJson.main;
    const initXmlPath = path.join(fullTargetPath, 'init.xml');
    const initXmlExists = fs.existsSync(initXmlPath);
    
    if (mainFile && !initXmlExists) {
      const initXmlContent = buildInitXml(mainFile, rootUrl);
      if (writeIfChanged(initXmlPath, initXmlContent)) {
        generatedFiles.push('init.xml');
        logger.success(`  ├─ Generated init.xml`);
      }
    } else if (initXmlExists && !devMode) {
      logger.success(`  ├─ Using existing init.xml`);
    }

    // 4. Создаём .filemap.json (per-module)
    if (executables.size > 0) {
      const filemapContent = generateFilemapJson(executables);
      const filemapPath = path.join(fullTargetPath, '.filemap.json');
      if (writeIfChanged(filemapPath, filemapContent)) {
        generatedFiles.push('.filemap.json');
        logger.success(`  ├─ Generated .filemap.json`);
      }
    }

    // 5. Формируем apiext запись
    let apiext: ApiExtEntry | undefined;
    
    const wsApiext = packageJson['ws:apiext'];
    if (wsApiext) {
      // Явно указано в package.json
      apiext = {
        name: wsApiext.name,
        libs: wsApiext.libs.map((lib: string) => rootUrl + '/' + path.posix.normalize(lib))
      };
    } else if (mainFile) {
      // Автоматически по main, используем wsName
      apiext = {
        name: `module:${wsName}`,
        libs: [rootUrl + '/init.xml']
      };
    }

    logger.success(`  └─ Standalone package linked: ${packageJson.name} (ws:name=${wsName})`);

    return {
      info: pkg,
      outputPath: fullTargetPath,
      apiext,
      generatedFiles
    };
  }
};
