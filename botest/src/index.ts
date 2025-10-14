#!/usr/bin/env node

import { program } from 'commander';
import { runTest } from './runner';

export type CommandLineOptions = {
}

function processTest(
  files: string[],
  options: CommandLineOptions
) {
  const cwd = process.cwd();

  runTest()

  process.exit(0);
}

program
  .name('botest')
  .description('Basic TypeScript CLI utility for file processing')
  .version('0.0.1')
  .option("")
  .arguments('[files...]')
  .action((files: string[], options: any) => {
    processTest(files, options);
  });

program.parse(process.argv);