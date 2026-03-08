/**
 * Дерево зависимостей проекта
 *
 * Построение, обход и вывод дерева npm-зависимостей.
 * Используется линковкой для определения system-пакетов (runtime и т.д.).
 *
 * @module linking/dependencies
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { logger } from '../utils/logger';

/**
 * Узел дерева зависимостей
 */
export class DependencyNode {
  name: string;
  version: string;
  dependencies: DependencyNode[];
  projectPath: string;
  hash: string;

  constructor(public packageJson: { name: string; version: string }, projectPath: string = '') {
    this.name = packageJson.name;
    this.version = packageJson.version;
    this.dependencies = [];
    this.projectPath = projectPath;
    this.hash = randomUUID();
  }
}

/**
 * Ищет system-пакеты (ws:package === "system") среди зависимостей проекта.
 *
 * Сканирует dependencies и devDependencies проекта, для каждого пакета
 * резолвит package.json через Node.js resolution (require.resolve),
 * что корректно работает с npm, pnpm и yarn.
 *
 * @param projectPath - путь к корню проекта
 * @returns массив узлов зависимостей с ws:package === "system"
 */
export async function getSystemDependencies(projectPath: string): Promise<DependencyNode[]> {
  const rootPackageJsonPath = path.join(projectPath, 'package.json');
  const rootPackageJson = JSON.parse(await fs.readFile(rootPackageJsonPath, 'utf-8'));

  // Собираем все зависимости проекта (dependencies + devDependencies)
  const allDeps: Record<string, string> = {
    ...(rootPackageJson.dependencies || {}),
    ...(rootPackageJson.devDependencies || {}),
  };

  // Создаём require с контекстом проекта для корректного resolve
  // (работает с npm, pnpm, yarn — следует Node resolution algorithm)
  const projectRequire = createRequire(path.join(projectPath, 'package.json'));

  const result: DependencyNode[] = [];

  for (const [depName] of Object.entries(allDeps)) {
    try {
      // Резолвим package.json пакета через Node resolution
      const depPackageJsonPath = projectRequire.resolve(`${depName}/package.json`);
      const depPackageJson = JSON.parse(await fs.readFile(depPackageJsonPath, 'utf-8'));

      const wsPackage = depPackageJson['ws:package'];
      if (wsPackage === 'system') {
        const depProjectPath = path.dirname(depPackageJsonPath);
        logger.info(`Найден system-пакет: ${depName} в ${depProjectPath}`);
        const depNode = new DependencyNode(depPackageJson, depProjectPath);
        result.push(depNode);
      }
    } catch {
      // Пакет не найден или не имеет package.json — пропускаем
    }
  }

  return result;
}

/**
 * Строит полное дерево зависимостей проекта.
 *
 * @param projectPath - путь к корню проекта
 * @returns корневой узел дерева
 */
export async function buildDependencyTree(projectPath: string) {
  const rootPackageJsonPath = path.join(projectPath, 'package.json');
  const nodeModulesPath = path.join(projectPath, 'node_modules');

  const rootPackageJson = JSON.parse(await fs.readFile(rootPackageJsonPath, 'utf-8'));
  const rootNode = new DependencyNode(rootPackageJson, projectPath);

  const processedModules = new Map<string, DependencyNode>();

  async function processDependencies(
    parentNode: DependencyNode,
    nodeModulesDir: string,
    packageJsonPath: string,
    visited = new Set<string>()
  ) {
    let dependencies: Record<string, string> = {};

    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      dependencies = packageJson.dependencies || {};
    } catch (_err) {
      logger.warning(`Не удалось прочитать package.json для ${parentNode.name}: ${packageJsonPath}`);
      return;
    }

    for (const [depName, depVersion] of Object.entries(dependencies)) {
      const depKey = `${depName}@${depVersion}`;

      if (visited.has(depKey)) {
        logger.warning(`Обнаружена циклическая зависимость: ${depKey}`);
        continue;
      }

      const depPath = path.join(nodeModulesDir, depName);

      try {
        const depPackageJsonPath = path.join(depPath, 'package.json');
        const depPackageJson = JSON.parse(await fs.readFile(depPackageJsonPath, 'utf-8'));

        const processedKey = `${depPackageJson.name}@${depPackageJson.version}`;

        let depNode: DependencyNode;

        if (processedModules.has(processedKey)) {
          depNode = processedModules.get(processedKey)!;
        } else {
          depNode = new DependencyNode(depPackageJson, depPath);
          processedModules.set(processedKey, depNode);

          const newVisited = new Set(visited);
          newVisited.add(depKey);

          await processDependencies(depNode, nodeModulesDir, depPackageJsonPath, newVisited);
        }

        parentNode.dependencies.push(depNode);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warning(`Не удалось обработать зависимость ${depName}: ${message}`);
      }
    }
  }

  await processDependencies(rootNode, nodeModulesPath, rootPackageJsonPath);
  return rootNode;
}

/**
 * Итеративное уплощение дерева зависимостей (безопасно для больших деревьев).
 *
 * @param rootNode - корневой узел
 * @returns массив узлов в порядке загрузки
 */
export function flattenDependencyTreeIterative(rootNode: DependencyNode): DependencyNode[] {
  const visited = new Set<string>();
  const result: DependencyNode[] = [];
  const stack: { node: DependencyNode; path: Set<string> }[] = [];

  stack.push({ node: rootNode, path: new Set() });

  while (stack.length > 0) {
    const { node, path } = stack.pop()!;

    if (path.has(node.hash)) {
      logger.warning(`Обнаружена циклическая зависимость: ${node.name}@${node.version}`);
      continue;
    }

    if (visited.has(node.hash)) {
      continue;
    }

    const unprocessedDeps = node.dependencies.filter(dep => !visited.has(dep.hash));

    if (unprocessedDeps.length === 0) {
      visited.add(node.hash);
      result.push(node);
    } else {
      stack.push({ node, path });

      const newPath = new Set(path);
      newPath.add(node.hash);

      for (const dep of unprocessedDeps) {
        if (!path.has(dep.hash)) {
          stack.push({ node: dep, path: newPath });
        }
      }
    }
  }

  return result;
}

/**
 * Выводит дерево зависимостей в консоль.
 */
export function printDependencyTree(node: DependencyNode, depth = 0) {
  logger.info('\n📦 Дерево зависимостей:');

  function printInternal(node: DependencyNode, depth: number) {
    logger.info('='.repeat(50));
    logger.info(`${' '.repeat(depth * 2)}${node.name}@${node.version}  [${node.hash}]`);
    for (const dep of node.dependencies) {
      printInternal(dep, depth + 1);
    }
  }

  printInternal(node, depth);
}

/**
 * Выводит плоский список зависимостей в консоль.
 */
export function printFlattenedTree(flatTree: DependencyNode[]) {
  logger.info('\n📦 Плоский список зависимостей (в порядке загрузки):');
  logger.info('='.repeat(50));
  flatTree.forEach((node, index) => {
    logger.info(`${(index + 1).toString().padStart(2)}. ${node.name}@${node.version}  [${node.hash}]`);
  });
}

/**
 * Извлекает только ws:package зависимости из плоского списка.
 */
export function extractBorisTypeDependencies(flatTree: DependencyNode[]): DependencyNode[] {
  return flatTree.filter(node => {
    const wsPackage = (node.packageJson as any)['ws:package'] as any;
    return typeof wsPackage === 'string';
  });
}
