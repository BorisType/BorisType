#!/usr/bin/env node

import { program } from "commander";
import { startServer } from "./server.js";
import { packageVersion } from "./version.js";

function decimal(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

program
  .name("boristype-mcp")
  .description("MCP server for WebSoft HCM — provides AI agents with access to server files")
  .version(packageVersion)
  .requiredOption("--host <host>", "WSHCM server host", process.env["WSHCM_HOST"] ?? "localhost")
  .requiredOption("--port <port>", "WSHCM server port", process.env["WSHCM_PORT"] ?? "80")
  .requiredOption("--username <username>", "Username for authentication", process.env["WSHCM_USERNAME"] ?? "user1")
  .requiredOption("--password <password>", "Password for authentication", process.env["WSHCM_PASSWORD"] ?? "user1")
  .option("--https", "Use HTTPS instead of HTTP", process.env["WSHCM_HTTPS"] === "true")
  .option("--connection-timeout-ms <ms>", "Deadline per HCM connection setup/probe request (default 5000 ms)")
  .action(
    async (options: { host: string; port: string; username: string; password: string; https: boolean; connectionTimeoutMs?: string }) => {
      await startServer({
        host: options.host,
        port: decimal(options.port),
        connectionTimeoutMs: options.connectionTimeoutMs === undefined ? undefined : decimal(options.connectionTimeoutMs),
        username: options.username,
        password: options.password,
        https: options.https,
      });
    },
  );

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
