/**
 * Linker для component пакетов
 * @module linking/linkers/component
 */

import * as fs from 'fs';
import * as path from 'path';
import { PackageLinker, LinkedPackage, PackageInfo, LinkingContext } from '../types';
import { copyRecursive } from '../utils/copy';
import { copyNodeModulesWithCache } from '../utils/node-modules';
import { writeIfChanged } from '../utils/write';
import { buildComponentXml, buildComponentJs } from '../generators/component';
import { buildComponentPackageJsonString } from '../generators/package-json';
import { generateFilemapJson } from '../generators/filemap';

/**
 * Linker для component пакетов
 * 
 * @remarks
 * Component пакеты:
 * - Помещаются в ./components/<ws:name>
 * - Генерируют spxml/<ws:name>.xml и spxml/<ws:name>.js
 * - Генерируют package.json для компонента
 * - Генерируют .filemap.json (per-module)
 * - НЕ регистрируются в api_ext.xml (своя логика загрузки)
 * - Копируют node_modules
 */
export const componentLinker: PackageLinker = {
  type: 'component',

  link(pkg: PackageInfo, ctx: LinkingContext): LinkedPackage {
    const { sourceDir, targetPath, packageJson, rootUrl, projectPath, wsName } = pkg;
    const { distPath, executables, logger, cache, devMode, changedFiles } = ctx;

    const generatedFiles: string[] = [];
    // Используем wsName для имён файлов и директорий
    const componentName = wsName;

    // Полный путь к целевой директории (./components/<ws:name>)
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

    // 3. Проверяем существование spxml файлов
    const spxmlDir = path.join(fullTargetPath, 'spxml');
    const xmlPath = path.join(spxmlDir, `${componentName}.xml`);
    const jsPath = path.join(spxmlDir, `${componentName}.js`);
    const xmlExists = fs.existsSync(xmlPath);
    const jsExists = fs.existsSync(jsPath);

    // 4. Генерируем spxml/<name>.xml (только если нет в build/)
    if (!xmlExists) {
      if (!fs.existsSync(spxmlDir)) {
        fs.mkdirSync(spxmlDir, { recursive: true });
      }
      const componentXmlContent = buildComponentXml(componentName);
      if (writeIfChanged(xmlPath, componentXmlContent)) {
        generatedFiles.push(`spxml/${componentName}.xml`);
      }
    }

    // 5. Генерируем spxml/<name>.js (только если нет в build/)
    const mainFile = packageJson.main;
    if (mainFile && !jsExists) {
      if (!fs.existsSync(spxmlDir)) {
        fs.mkdirSync(spxmlDir, { recursive: true });
      }
      const componentJsContent = buildComponentJs(componentName, mainFile, rootUrl);
      if (writeIfChanged(jsPath, componentJsContent)) {
        generatedFiles.push(`spxml/${componentName}.js`);
      }
    }

    // Логируем результат
    if (!devMode) {
      if (!xmlExists || !jsExists) {
        const generated = [];
        if (!xmlExists) generated.push(`${componentName}.xml`);
        if (!jsExists && mainFile) generated.push(`${componentName}.js`);
        if (generated.length > 0) {
          logger.success(`  ├─ Generated spxml/${generated.join(', spxml/')}`);
        }
      } else {
        logger.success(`  ├─ Using existing spxml/${componentName}.xml, spxml/${componentName}.js`);
      }
    }

    // 6. Генерируем package.json для компонента (используем wsName)
    const componentPkgJson = buildComponentPackageJsonString({
      name: wsName,
      version: packageJson.version,
      description: packageJson.description
    });
    const pkgJsonPath = path.join(fullTargetPath, 'package.json');
    if (writeIfChanged(pkgJsonPath, componentPkgJson)) {
      generatedFiles.push('package.json');
      if (!devMode) {
        logger.success(`  ├─ Generated package.json`);
      }
    }

    // 7. Создаём .filemap.json (per-module)
    if (executables.size > 0) {
      const filemapContent = generateFilemapJson(executables);
      const filemapPath = path.join(fullTargetPath, '.filemap.json');
      if (writeIfChanged(filemapPath, filemapContent)) {
        generatedFiles.push('.filemap.json');
        logger.success(`  ├─ Generated .filemap.json`);
      }
    }

    logger.success(`  └─ Component package linked: ${componentName}`);

    // Компоненты НЕ регистрируются в api_ext.xml
    return {
      info: pkg,
      outputPath: fullTargetPath,
      apiext: undefined,
      generatedFiles
    };
  }
};
