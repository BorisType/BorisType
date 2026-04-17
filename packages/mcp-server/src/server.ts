import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServerOptions } from "./types.js";
import { createConnection, closeConnection } from "./connection.js";
import type { WshcmConnection } from "./connection.js";
import {
  registerReadFileTool,
  registerWriteFileTool,
  registerListDirectoryTool,
  registerDeleteFileTool,
  registerMoveFileTool,
  registerEditFileTool,
  registerReadMultipleFilesTool,
  registerCreateDirectoryTool,
  registerSearchFilesTool,
  registerDirectoryTreeTool,
  registerGetFileInfoTool,
} from "./tools/index.js";

/**
 * Создаёт и запускает MCP сервер для WebSoft HCM.
 *
 * Подключается к WSHCM серверу, регистрирует tools и слушает stdin/stdout.
 *
 * @param options - параметры подключения к WSHCM
 */
export async function startServer(options: McpServerOptions): Promise<void> {
  const server = new McpServer({
    name: "boristype-wshcm",
    version: "0.1.0",
  });

  let connection: WshcmConnection;
  try {
    connection = await createConnection(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to connect to WSHCM server: ${message}\n`);
    process.exit(1);
  }

  // Регистрация tools
  registerReadFileTool(server, connection);
  registerWriteFileTool(server, connection);
  registerListDirectoryTool(server, connection);
  registerDeleteFileTool(server, connection);
  registerMoveFileTool(server, connection);
  registerEditFileTool(server, connection);
  registerReadMultipleFilesTool(server, connection);
  registerCreateDirectoryTool(server, connection);
  registerSearchFilesTool(server, connection);
  registerDirectoryTreeTool(server, connection);
  registerGetFileInfoTool(server, connection);

  // Graceful shutdown
  const shutdown = async () => {
    await closeConnection(connection);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Запуск транспорта
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
