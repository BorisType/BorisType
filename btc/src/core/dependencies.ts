import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// Класс для узла дерева зависимостей
export class DependencyNode {
  constructor(public packageJson: { name: string; version: string }, projectPath: string = '') {
    this.name = packageJson.name;
    this.version = packageJson.version;
    this.dependencies = [];
    this.projectPath = projectPath;
    this.hash = randomUUID();
  }

  name: string;
  version: string;
  dependencies: DependencyNode[];
  projectPath: string;
  hash: string;
}

export async function getCompilerRequiredDependencies(projectPath: string): Promise<DependencyNode[]> {
  const rootPackageJsonPath = path.join(projectPath, 'package.json');
  const nodeModulesPath = path.join(projectPath, 'node_modules');

  const rootPackageJson = JSON.parse(await fs.readFile(rootPackageJsonPath, 'utf-8'));
  
  const devDependencies = rootPackageJson.devDependencies || {};
  const btcRemoteDependency = devDependencies['@boristype/btc'] !== undefined;
  const btcLocalDependency = devDependencies['btc'] !== undefined;

  if (!btcLocalDependency && !btcRemoteDependency) {
    console.warn(`Предупреждение: В devDependencies отсутствует зависимость 'btc'.`);
    return [];
  }

  const btcPath = btcRemoteDependency ? path.join(nodeModulesPath, '@boristype', 'btc') : path.join(nodeModulesPath, 'btc');
  const btcPackageJsonPath = path.join(btcPath, 'package.json');
  const btcPackageJson = JSON.parse(await fs.readFile(btcPackageJsonPath, 'utf-8'));

  const btcDependencies = btcPackageJson.dependencies || {};

  const result: DependencyNode[] = [];

  for (const [depName, depVersion] of Object.entries(btcDependencies)) {
    // console.log(`Требуемая зависимость компилятора: ${depName}@${depVersion}`);

    if (depName.startsWith('@boristype/')) {
      // Обработка зависимостей BorisType

      // Если btc установлен из репозитория, ищем в node_modules проекта
      // Если btc установлен локально (file:...), ищем в node_modules внутри btc
      const btcNodeModulesPath = btcRemoteDependency ? nodeModulesPath : path.join(btcPath, 'node_modules');
      const depPath = path.join(btcNodeModulesPath, depName);

      try {
        const depPackageJsonPath = path.join(depPath, 'package.json');
        const depPackageJson = JSON.parse(await fs.readFile(depPackageJsonPath, 'utf-8'));

        // console.log(`  Найдена зависимость BorisType: ${depName}@${depPackageJson.version}`);

        const depNode = new DependencyNode(depPackageJson, depPath);
        result.push(depNode);
      } catch (err) {
        if (err instanceof Error) {
          console.warn(`Не удалось обработать зависимость ${depName}: ${err.message}`);
        } else {
          console.warn(`Не удалось обработать зависимость ${depName}: ${String(err)}`);
        }
      }
    }
  }

  return result;
}

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
    } catch (err) {
      console.warn(`Не удалось прочитать package.json для ${parentNode.name}: ${packageJsonPath}`);
      return;
    }

    for (const [depName, depVersion] of Object.entries(dependencies)) {
      const depKey = `${depName}@${depVersion}`;

      if (visited.has(depKey)) {
        console.warn(`Обнаружена циклическая зависимость: ${depKey}`);
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
        if (err instanceof Error) {
          console.warn(`Не удалось обработать зависимость ${depName}: ${err.message}`);
        } else {
          console.warn(`Не удалось обработать зависимость ${depName}: ${String(err)}`);
        }
      }
    }
  }

  await processDependencies(rootNode, nodeModulesPath, rootPackageJsonPath);
  return rootNode;
}

// Альтернативная версия с итеративным подходом (более безопасная для больших деревьев)
export function flattenDependencyTreeIterative(rootNode: DependencyNode): DependencyNode[] {
  const visited = new Set<string>();
  const result: DependencyNode[] = [];
  const stack: { node: DependencyNode; path: Set<string> }[] = [];

  stack.push({ node: rootNode, path: new Set() });

  while (stack.length > 0) {
    const { node, path } = stack.pop()!;

    // Проверяем циклические зависимости
    if (path.has(node.hash)) {
      console.warn(`Обнаружена циклическая зависимость: ${node.name}@${node.version}`);
      continue;
    }

    // Если узел уже был обработан, пропускаем
    if (visited.has(node.hash)) {
      continue;
    }

    // Проверяем, все ли зависимости уже обработаны
    const unprocessedDeps = node.dependencies.filter(dep => !visited.has(dep.hash));

    if (unprocessedDeps.length === 0) {
      // Все зависимости обработаны - добавляем текущий узел
      visited.add(node.hash);
      result.push(node);
    } else {
      // Есть необработанные зависимости - откладываем текущий узел и обрабатываем зависимости
      stack.push({ node, path });

      // Добавляем необработанные зависимости в стек
      const newPath = new Set(path);
      newPath.add(node.hash);

      for (const dep of unprocessedDeps) {
        if (!path.has(dep.hash)) { // Проверяем циклы только для новых узлов
          stack.push({ node: dep, path: newPath });
        }
      }
    }
  }

  return result;
}

// Функция для вывода дерева (без изменений)
export function printDependencyTree(node: DependencyNode, depth = 0) {
  console.log('\n📦 Дерево зависимостей:');
  console.log('='.repeat(50));
  console.log(`${' '.repeat(depth * 2)}${node.name}@${node.version}  [${node.hash}]`);
  for (const dep of node.dependencies) {
    printDependencyTree(dep, depth + 1);
  }
}

// Функция для вывода плоского массива
export function printFlattenedTree(flatTree: DependencyNode[]) {
  console.log('\n📦 Плоский список зависимостей (в порядке загрузки):');
  console.log('='.repeat(50));
  flatTree.forEach((node, index) => {
    console.log(`${(index + 1).toString().padStart(2)}. ${node.name}@${node.version}  [${node.hash}]`);
  });
}

export function extractBorisTypeDependencies(flatTree: DependencyNode[]): DependencyNode[] {
  return flatTree.filter(node => {
    const wsRoot = (node.packageJson as any)['ws:root'] as string;
    const wsApiext = (node.packageJson as any)['ws:apiext'] as any;
    return typeof wsRoot === 'string' && typeof wsApiext === 'object' && Array.isArray(wsApiext.libs)
  });
}