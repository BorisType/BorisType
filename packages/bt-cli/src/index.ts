#!/usr/bin/env node

import { COMPILE_MODES, DEFAULT_COMPILE_MODE } from "@boristype/bt-ir";
import { Option, program } from "commander";
import packageInfo from "../package.json";

import { initCommand, buildCommand, linkCommand, artifactCommand, devCommand, pushCommand } from "./cli/commands";
import type { BtcCompileOptions } from "./core/building/types";
import { objectsApplyCommand } from "./cli/commands/objects";
import type { PushCommandOptions } from "./core/pushing/types";

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
  .addOption(new Option("--compile-mode <mode>", `Transpilation mode (default: ${DEFAULT_COMPILE_MODE})`).choices(COMPILE_MODES))
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

program
  .command("objects")
  .description("Manage individual platform objects")
  .command("apply <file>")
  .description("Create or patch one HCM object from <objectType>/<decimal ID>.xml")
  .option("--dry-run", "Preview the changes on the server")
  .option("--host <host>", "WSHCM server host")
  .option("--port <port>", "WSHCM server port")
  .option("--username <username>", "Username for authentication")
  .option("--password <password>", "Password for authentication")
  .option("--https", "Use HTTPS")
  .action(objectsApplyCommand);

program.parseAsync(process.argv).catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
