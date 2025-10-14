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
  .description('Basic TypeScript CLI utility for file processing')
  .version('0.0.1')
  .option('--init', 'Initializes a BorisType project and creates a tsconfig.json file.')
  .option('--outDir <dir>', 'Output directory for processed files')
  .option('--include-non-ts-files', 'Enable "include-non-ts-files" mode', false)
  .option('--retain-non-ascii-characters', 'Enable "retain-non-ascii-characters" mode', false)
  .option('--remove-comments', 'Remove comments from files', false)
  .arguments('[files...]')
  .action((files: string[], options: any) => {
    processBuild(files, options);
  });

// Parse command-line arguments
program.parse(process.argv);