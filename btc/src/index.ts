#!/usr/bin/env node

import { program } from 'commander';
import { generateDefaultTSConfig, getTSConfig } from './core/tsconfig';
import { buildNonTypescriptFiles, buildTypescriptFiles } from './core/build';
import { ParsedCommandLine } from 'typescript';
import { logger } from './core/logger';

export type BscCompileOptions = {
  init?: boolean
  outDir?: string;
  includeNonTsFiles?: boolean;
  retainNonAsciiCharacters?: boolean;
  removeComments?: boolean;
}

function processBuild(
  files: string[],
  options: BscCompileOptions
) {
  const cwd = process.cwd();

  require.resolve("@babel/preset-env")
  if (options.init === true) {
    generateDefaultTSConfig(cwd);
    process.exit(0);
  }

  logger.success(`🔨 ${new Date().toLocaleTimeString()} Project building started`);

  const configuration = getTSConfig(cwd, 'tsconfig.json', options);
  buildTypescriptFiles(configuration, options);
  buildNonTypescriptFiles(configuration, options);

  logger.success(`✅ ${new Date().toLocaleTimeString()} Project building finished`);
  
  process.exit(0);
}

program
  .name('bsc')
  .description(require('../package.json').description)
  .version(require('../package.json').version)
  .option('--init', 'Initialize a BorisType project and create a tsconfig.json file.')
  .option('--outDir <dir>', 'Directory to save processed files')
  .option('--include-non-ts-files', 'Process files that are not TypeScript', false)
  .option('--retain-non-ascii-characters', 'Keep non-ASCII characters in source files', false)
  .option('--remove-comments', 'Remove comments from source files', false)
  .arguments('[files...]')
  .action((files: string[], options: any) => {
    processBuild(files, options);
  });

// Parse command-line arguments
program.parse(process.argv);