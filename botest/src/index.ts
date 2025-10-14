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

  console.log('Running tests in:', cwd);
  console.log('Running tests in:', files);
  const workdir = files[0] || cwd;
  runTest(workdir);

  process.exit(0);
}

program
  .name('botest')
  .description('Basic TypeScript CLI utility for file processing')
  .version('0.0.1')
  .arguments('[files...]')
  .action((files: string[], options: any) => {
    processTest(files, options);
  });

program.parse(process.argv);