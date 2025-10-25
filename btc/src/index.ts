#!/usr/bin/env node

import { program } from 'commander';
import { generateDefaultTSConfig, getTSConfig } from './core/tsconfig';
import { buildNonTypescriptFiles, buildTypescriptFiles } from './core/build';
import { ParsedCommandLine } from 'typescript';
import { logger } from './core/logger';
// import path from 'node:path';
// import fs from 'node:fs';
import { copyWithPrefix, processLinking } from './core/linking';
import { buildDependencyTree, flattenDependencyTreeIterative, printFlattenedTree } from './core/dependencies';

export type BscCompileOptions = {
  init?: boolean
  linking?: boolean;
  outDir?: string;
  includeNonTsFiles?: boolean;
  retainNonAsciiCharacters?: boolean;
  usePolyfill?: boolean;
  removeComments?: boolean;
}

async function processBuild(
  files: string[],
  options: BscCompileOptions
) {
  const cwd = process.cwd();

  if (options.init === true) {
    processInit();
  }

  if (options.linking === true) {
    await processLinking();
    process.exit(0);
  }

  logger.success(`🔨 ${new Date().toLocaleTimeString()} Project building started`);

  const configuration = getTSConfig(cwd, 'tsconfig.json', options);
  buildTypescriptFiles(configuration, options);
  buildNonTypescriptFiles(configuration, options);

  logger.success(`✅ ${new Date().toLocaleTimeString()} Project building finished`);

  process.exit(0);
}

function processInit() {
  const cwd = process.cwd();
  generateDefaultTSConfig(cwd);
  process.exit(0);
}


program
  .name('bsc')
  .description(require('../package.json').description)
  .version(require('../package.json').version)
  .option('--init', 'Initialize a BorisType project and create a tsconfig.json file.')
  .option('--linking', 'Create dist with structure')
  .option('--outDir <dir>', 'Directory to save processed files')
  .option('--include-non-ts-files', 'Process files that are not TypeScript', false)
  .option('--retain-non-ascii-characters', 'Keep non-ASCII characters in source files', false)
  .option('--no-use-polyfill', 'Do not use polyfills')
  .option('--remove-comments', 'Remove comments from source files', false)
  .arguments('[files...]')
  .action(async (files: string[], options: any) => {
    await processBuild(files, options);
  });

// Parse command-line arguments
program.parse(process.argv);

// const fs = require('fs').promises;
// const path = require('path');

// Класс для узла дерева зависимостей
// C:\Users\vomoh\Desktop\projects\BorisType\tests\package.json
// C:\Users\vomoh\Desktop\projects\BorisType\tests\package.json




// Использование (без изменений)
// async function main() {
//   const projectPath = process.cwd();
//   const dependencyTree = await buildDependencyTree(projectPath);
//   // printDependencyTree(dependencyTree);
//   const flatTree = flattenDependencyTreeIterative(dependencyTree);
//   printFlattenedTree(flatTree);
// }

// main().catch(console.error);