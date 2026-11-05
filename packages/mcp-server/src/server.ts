import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServerOptions } from "./types.js";
import { createConnection, closeConnection } from "./connection.js";
import type { WshcmConnection } from "./connection.js";
import { registerReadFileTool, registerWriteFileTool, registerListDirectoryTool, registerDeleteFileTool } from "./tools/index.js";

/**
 * Создаёт MCP сервер с реализованными tools и предоставленным соединением.
 *
 * Соединение и транспорт принадлежат вызывающему коду. Эта функция не открывает
 * сетевые соединения и позволяет проверять MCP protocol без HCM.
 * @param connection - инициализированное соединение или test double
 * @returns сервер без подключённого транспорта
 */
export function createServer(connection: WshcmConnection): McpServer {
  const server = new McpServer({
    name: "boristype-wshcm",
    version: "0.1.0-alpha.1",
  });

  registerReadFileTool(server, connection);
  registerWriteFileTool(server, connection);
  registerListDirectoryTool(server, connection);
  registerDeleteFileTool(server, connection);

  return server;
}

/**
 * Подключается к HCM и запускает MCP сервер через stdin/stdout.
 * @param options - параметры подключения к WSHCM
 */
export async function startServer(options: McpServerOptions): Promise<void> {
  let connection: WshcmConnection;
  try {
    connection = await createConnection(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to connect to WSHCM server: ${message}\n`);
    process.exit(1);
  }

  const server = createServer(connection);

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
