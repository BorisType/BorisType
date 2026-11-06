import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import type { McpServerOptions } from "./types.js";
import { createConnection, closeConnection } from "./connection.js";
import type { WshcmConnection } from "./connection.js";
import {
  registerReadFileTool,
  registerWriteFileTool,
  registerListDirectoryTool,
  registerDeleteFileTool,
  registerSearchFilesTool,
} from "./tools/index.js";

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
  registerSearchFilesTool(server, connection);

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

  let server: McpServer | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let exitCode = 0;

  // EOF and signals can arrive together. Defer work until the shared promise is set:
  // server.close() itself invokes onclose and must not start another cleanup.
  const shutdown = (code = 0): Promise<void> => {
    exitCode = Math.max(exitCode, code);
    shutdownPromise ??= Promise.resolve().then(async () => {
      try {
        await server?.close();
      } catch (error) {
        exitCode = 1;
        process.stderr.write(`Failed to close MCP transport: ${String(error)}\n`);
      }
      try {
        await closeConnection(connection);
      } catch (error) {
        exitCode = 1;
        process.stderr.write(`Failed to clean up WSHCM connection: ${String(error)}\n`);
      }
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      process.exit(exitCode);
    });
    return shutdownPromise;
  };
  const onSignal = () => {
    void shutdown();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    server = createServer(connection);
    server.server.onclose = () => {
      void shutdown();
    };
    await server.connect(new StdioServerTransport());
  } catch (error) {
    process.stderr.write(`Failed to start MCP transport: ${String(error)}\n`);
    await shutdown(1);
  }
}
