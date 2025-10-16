import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { buildDependencyTree, extractBorisTypeDependencies, flattenDependencyTreeIterative, printDependencyTree, printFlattenedTree } from './dependencies';


type WsPackageInfo = {
  projectPath: string;
  root: string;
  rootUrl: string;
  apiext: WsLinkingLibraries;
}

type WsLinkingLibraries = {
  name: string;
  libs: string[];
}


export async function processLinking() {
  const projectPath = process.cwd();
  const dependencyTree = await buildDependencyTree(projectPath);
  printDependencyTree(dependencyTree);
  const flatTree = flattenDependencyTreeIterative(dependencyTree);
  printFlattenedTree(flatTree);
  const borisTypeDeps = extractBorisTypeDependencies(flatTree);


  // const cwd = process.cwd();
  const packageFilePath = path.join(projectPath, 'package.json');
  const packageJson = require(packageFilePath);
  const packageInfo = parseWsPackageInfo(packageJson, projectPath);
  if (!packageInfo) {
    logger.error(`Ошибка: В package.json отсутствуют необходимые поля ws:root и ws:apiext`);
    process.exit(1);
  }

  const linkingPackages = borisTypeDeps.map(dep => parseWsPackageInfo(dep.packageJson, dep.projectPath)!);
  const apiExtXml = buildApiExt(linkingPackages);

  console.log(apiExtXml);

  const distFilePath = path.join(projectPath, 'dist');
  if (!fs.existsSync(distFilePath)) {
    fs.mkdirSync(distFilePath);
  }


  linkingPackages.forEach(dep => {
    // console.log(`Копирование файлов из пакета ${dep.name}@${dep.version}`);

    const buildFilePath = path.join(dep.projectPath, 'build');
    const distFilePath = path.join(projectPath, 'dist');

    copyWithPrefix(
      buildFilePath,
      distFilePath,
      dep.root
    );
  });

  const apiExtXmlFilePath = path.join(distFilePath, 'source', 'api_ext.xml');
  fs.mkdirSync(path.dirname(apiExtXmlFilePath), { recursive: true });
  fs.writeFileSync(apiExtXmlFilePath, apiExtXml, { encoding: 'utf-8' });

  process.exit(0);
}

function parseWsPackageInfo(packageJson: any, projectPath: string): WsPackageInfo | null {
  const wsRoot = packageJson['ws:root'] as string;
  const wsApiext = packageJson['ws:apiext'] as WsLinkingLibraries;
  if (typeof wsRoot === 'string' && typeof wsApiext === 'object' && Array.isArray(wsApiext.libs)) {
    const rootUrl = "x-local://" + path.posix.normalize(wsRoot);
    wsApiext.libs = wsApiext.libs.map(lib => rootUrl + "/" + path.posix.normalize(lib))

    return {
      projectPath: projectPath,
      root: wsRoot,
      rootUrl: rootUrl,
      apiext: wsApiext
    };
  } else {
    return null;
  }
}

function buildApiExt(linkingPackages: WsPackageInfo[]) {
  let apiExtXml = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n";

  apiExtXml += "<api_ext>\n";
  apiExtXml += "\t<apis>\n";

  linkingPackages.forEach(pkg => {
    apiExtXml += `\t\t<api>\n`;

    apiExtXml += `\t\t\t<name>${pkg.apiext.name}</name>\n`;

    pkg.apiext.libs.forEach(lib => {
      apiExtXml += `\t\t\t<lib>\n`;
      apiExtXml += `\t\t\t\t<path>${lib}</path>\n`;
      apiExtXml += `\t\t\t</lib>\n`;
    });

    apiExtXml += `\t\t</api>\n`;
  });

  apiExtXml += "\t</apis>\n";
  apiExtXml += "</api_ext>\n";

  return apiExtXml;
}

/**
 * Копирует все содержимое папки в другую папку с добавлением префикса к относительным путям
 * @param sourceDir Исходная папка
 * @param targetDir Целевая папка
 * @param pathPrefix Префикс для относительных путей (например: './wt/test')
 */
export function copyWithPrefix(
  sourceDir: string,
  targetDir: string,
  pathPrefix: string
): void {
  // Нормализуем пути
  const normalizedSource = path.normalize(sourceDir);
  const normalizedTarget = path.normalize(targetDir);
  const normalizedPrefix = path.normalize(pathPrefix);

  // Создаем целевую папку с учетом префикса
  const targetWithPrefix = path.join(normalizedTarget, normalizedPrefix);

  // Рекурсивно копируем содержимое
  copyRecursive(normalizedSource, targetWithPrefix);
}

/**
 * Рекурсивно копирует файлы и папки
 */
function copyRecursive(source: string, target: string): void {
  // Создаем целевую директорию если ее нет
  fs.mkdirSync(target, { recursive: true });

  // Читаем содержимое исходной папки
  const items = fs.readdirSync(source, { withFileTypes: true });

  for (const item of items) {
    const sourcePath = path.join(source, item.name);
    const targetPath = path.join(target, item.name);

    if (item.isDirectory()) {
      // Если это папка - рекурсивно копируем
      copyRecursive(sourcePath, targetPath);
    } else {
      // Если это файл - копируем
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`Скопирован: ${sourcePath} -> ${targetPath}`);
    }
  }
}