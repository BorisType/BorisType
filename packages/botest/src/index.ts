#!/usr/bin/env node

import { program } from "commander";
import { runTestsAsync } from "./tester";

async function processTest(files: string[]) {
  const cwd = process.cwd();

  const workdir = files[0] || cwd;
  const filters = files.slice(1);
  await runTestsAsync(workdir, cwd, filters);

  process.exit(0);
}

program
  .name("botest")
  .description("BorisScript test runner — executes transpiled tests in BS interpreter")
  .version("0.0.1")
  .arguments("[files...]")
  .action(async (files: string[]) => {
    await processTest(files);
  });

program.parse(process.argv);
