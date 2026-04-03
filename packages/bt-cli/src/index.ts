#!/usr/bin/env node

import { program } from "commander";
import packageInfo from "../package.json";

import { initCommand, buildCommand, linkCommand, artifactCommand, devCommand, pushCommand, objectsPullCommand } from "./cli/commands";
import type { BtcCompileOptions } from "./core/building/types";
import type { PushCommandOptions } from "./core/pushing/types";
import type { ObjectsPullCommandOptions } from "./cli/commands/objects-pull";

// Реэкспорт типов для обратной совместимости
export type { BtcCompileOptions, BtcConfiguration } from "./core/building/types";

program.name("btc").description(packageInfo.description).version(packageInfo.version);

// Команда init
program
  .command("init")
  .description("Initialize a BorisType project and create a tsconfig.json file")
  .action(async () => {
    await initCommand();
  });

// Команда build (по умолчанию)
program
  .command("build [files...]", { isDefault: true })
  .description("Transpile TypeScript to BorisScript")
  .option("--outDir <dir>", "Directory to save processed files")
  .option("--include-non-ts-files", "Process files that are not TypeScript", false)
  .option("--retain-non-ascii-characters", "Keep non-ASCII characters in source files", false)
  .option("--remove-comments", "Remove comments from source files", false)
  .option("--compile-mode <mode>", "Transpilation mode: bare | script | module (default: module)")
  .action(async (files: string[], options: BtcCompileOptions) => {
    await buildCommand(files, options);
  });

// Команда link
program
  .command("link")
  .description("Link modules and dependencies into dist structure")
  .option("--clean", "Clean dist directory and cache before linking", false)
  .option("--no-cache", "Do not use cache for node_modules (but do not delete it)")
  .option("--linking-system-as <mode>", 'How to link system packages: "standalone" or "component"', "component")
  .option("--external-runtime", "Skip linking system packages (runtime is managed externally)", false)
  .action(async (options: { clean?: boolean; cache?: boolean; linkingSystemAs?: string; externalRuntime?: boolean }) => {
    const systemMode = options.linkingSystemAs as "standalone" | "component" | undefined;
    // Commander парсит --no-cache как cache: false (по умолчанию cache: true)
    await linkCommand({
      clean: options.clean,
      noCache: options.cache === false,
      linkingSystemAs: systemMode,
      externalRuntime: options.externalRuntime,
    });
  });

// Команда artifact
program
  .command("artifact")
  .description("Create distribution archive from dist folder")
  .option("--clean", "Clean artifact directory before creating archives", false)
  .action(async (options: { clean?: boolean }) => {
    await artifactCommand(options);
  });

// Команда dev
program
  .command("dev")
  .description("Start development mode with watch")
  .option("--no-push", "Disable auto-push to WSHCM server after linking")
  .action(async (options: { push?: boolean }) => {
    await devCommand({ push: options.push });
  });

// Команда push (загрузка dist на WSHCM сервер)
program
  .command("push")
  .description("Upload dist folder to WSHCM server")
  .option("--host <host>", "WSHCM server host (default: localhost)")
  .option("--port <port>", "WSHCM server port (default: 80)", parseInt)
  .option("--username <username>", "Username for authentication (default: user1)")
  .option("--password <password>", "Password for authentication (default: user1)")
  .option("--https", "Use HTTPS instead of HTTP", false)
  .action(async (options: PushCommandOptions) => {
    await pushCommand(options);
  });

// Команда objects (подкоманды)
const objectsCmd = program.command("objects").description("Manage platform objects");

// Общие connection options для objects subcommands
const connectionOptions = [
  ["--host <host>", "WSHCM server host (default: localhost)"],
  ["--port <port>", "WSHCM server port (default: 80)"],
  ["--username <username>", "Username for authentication (default: user1)"],
  ["--password <password>", "Password for authentication (default: user1)"],
  ["--https", "Use HTTPS instead of HTTP"],
] as const;

const pullCmd = objectsCmd
  .command("pull")
  .description("Pull modified objects from server")
  .option("--all", "Accept all ours objects without interactive selection", false)
  .option("--assign-to <package>", "Default package for new objects (with --all)")
  .option("--since <date>", 'Sync since date: ISO 8601, "today", "git", or commit hash (required on first run)');

for (const [flag, desc] of connectionOptions) {
  pullCmd.option(flag, desc);
}

pullCmd.action(async (options: ObjectsPullCommandOptions) => {
  await objectsPullCommand(options);
});

program.parse(process.argv);
