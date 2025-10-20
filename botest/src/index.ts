#!/usr/bin/env node

import { program } from 'commander';
import { runTestsAsync } from './tester';

export type CommandLineOptions = {
}

async function processTest(
  files: string[],
  options: CommandLineOptions
) {
  const cwd = process.cwd();

  const workdir = files[0] || cwd;
  await runTestsAsync(workdir);

  process.exit(0);
}

program
  .name('botest')
  .description('Basic TypeScript CLI utility for file processing')
  .version('0.0.1')
  .arguments('[files...]')
  .action(async (files: string[], options: any) => {
    await processTest(files, options);
  });

program.parse(process.argv);