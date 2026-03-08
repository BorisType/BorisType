#!/usr/bin/env node

import { program } from 'commander';
import { runTestsAsync } from './tester';

export type CommandLineOptions = {
}

async function processTest(
  files: string[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  options: CommandLineOptions
) {
  const cwd = process.cwd();

  const workdir = files[0] || cwd;
  const filters = files.slice(1);
  await runTestsAsync(workdir, cwd, filters);

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
