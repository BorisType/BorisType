#!/usr/bin/env node

import { program } from "commander";
import { runTestsAsync } from "./tester";

interface CliOptions {
  verbose?: boolean;
  nodeCheck?: boolean;
}

async function processTest(files: string[], options: CliOptions) {
  const cwd = process.cwd();

  const workdir = files[0] || cwd;
  const filters = files.slice(1);
  await runTestsAsync(workdir, cwd, filters, {
    verbose: options.verbose ?? false,
    nodeCheck: options.nodeCheck ?? false,
  });

  process.exit(0);
}

program
  .name("botest")
  .description("BorisScript test runner — executes transpiled tests in BS interpreter")
  .version("0.0.1")
  .option("-v, --verbose", "Show all test results including passed")
  .option("--node-check", "Also run tests in Node.js to validate test logic")
  .arguments("[files...]")
  .action(async (files: string[], options: CliOptions) => {
    await processTest(files, options);
  });

program.parse(process.argv);
