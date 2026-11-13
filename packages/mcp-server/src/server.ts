import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import type { McpServerOptions } from "./types.js";
import { createConnection, closeConnection } from "./connection.js";
import type { WshcmConnection } from "./connection.js";
import { ReadState } from "./tools/read-state.js";
import { packageVersion } from "./version.js";
import {
  registerReadFileTool,
  registerWriteFileTool,
  registerListDirectoryTool,
  registerDeleteFileTool,
  registerSearchFilesTool,
  registerEditFileTool,
  registerCreateDirectoryTool,
  registerMoveFileTool,
  registerGetFileInfoTool,
  registerXQueryTool,
  registerObjectTools,
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
  const server = new McpServer(
    {
      name: "boristype-wshcm",
      version: packageVersion,
    },
    {
      instructions: [
        "File tools access physical server files, not database-backed URL blobs. Confirm which storage the application uses.",
        "Locate files with search/list, then read with wshcm_read_file before edit or overwrite. Search results and dryRun previews do not grant read coverage. Chain the previous readToken when reading additional ranges; use the newest token for the exact URL. Overwrite requires full coverage. Tokens belong to this MCP instance, not an isolated chat; do not reuse tokens from another instance or bypass reads with delete/create.",
        "After a file mutation attempt, reread before another edit. On Conflict/ReadRequired, refresh the relevant reads instead of repeating stale arguments.",
        "wshcm_xquery accepts server-side XQuery including sql:, without a BorisType DLL. Queries can modify data. Row/output limits do not bound database work, and truncated results are incomplete. After a timeout or lost mutation response, establish the actual outcome before retrying; cancellation and rollback are not guaranteed.",
        "On the tested Linux C/PostgreSQL path, negative SQL integers can become null before SOAP; CAST them to text in SQL to preserve the value. SQL NULL and empty text may be indistinguishable. Preserve exact IDs as text or with lossless JSON parsing; JavaScript Number can round large integer tokens.",
        "Object tools use native XML strings: get_form returns expanded schema, get_object returns a full document and readToken, save_object explicitly creates or fully replaces it. Omitted fields are removed on replace. Read the complete object in this MCP instance before replacing, reread after every replace attempt, and preserve exact IDs as decimal strings. XML validation is partial; platform types/defaults/hooks still apply. Form loading may execute code. Save errors/timeouts can leave persisted changes; no atomic CAS, rollback, UI permission equivalence or blind retry guarantee.",
      ].join("\n"),
    },
  );

  const reads = new ReadState();
  registerReadFileTool(server, connection, reads);
  registerWriteFileTool(server, connection, reads);
  registerListDirectoryTool(server, connection);
  registerDeleteFileTool(server, connection, reads);
  registerSearchFilesTool(server, connection);
  registerEditFileTool(server, connection, reads);
  registerCreateDirectoryTool(server, connection, reads);
  registerMoveFileTool(server, connection, reads);
  registerGetFileInfoTool(server, connection);
  registerXQueryTool(server, connection);
  registerObjectTools(server, connection);

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
