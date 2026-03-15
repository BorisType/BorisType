#!/usr/bin/env node

import { program } from "commander";
import { startServer } from "./server.js";

program
  .name("boristype-mcp")
  .description("MCP server for WebSoft HCM — provides AI agents with access to server files")
  .version("0.1.0-alpha.1")
  .requiredOption("--host <host>", "WSHCM server host", process.env["WSHCM_HOST"] ?? "localhost")
  .requiredOption("--port <port>", "WSHCM server port", process.env["WSHCM_PORT"] ?? "80")
  .requiredOption(
    "--username <username>",
    "Username for authentication",
    process.env["WSHCM_USERNAME"] ?? "user1",
  )
  .requiredOption(
    "--password <password>",
    "Password for authentication",
    process.env["WSHCM_PASSWORD"] ?? "user1",
  )
  .option("--https", "Use HTTPS instead of HTTP", process.env["WSHCM_HTTPS"] === "true")
  .action(
    async (options: {
      host: string;
      port: string;
      username: string;
      password: string;
      https: boolean;
    }) => {
      await startServer({
        host: options.host,
        port: parseInt(options.port, 10),
        username: options.username,
        password: options.password,
        https: options.https,
      });
    },
  );

program.parse();
