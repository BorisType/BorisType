import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import type { McpServerOptions } from "./types.js";
import { ConnectionManager } from "./connection-manager.js";
import type { WshcmConnection } from "./connection.js";
import { WshcmApi, type WshcmEvaluator } from "@boristype/ws-client";
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
  registerPackageTools,
  registerRuntimeStatusTool,
  registerSystemInfoTool,
  registerExecuteTool,
} from "./tools/index.js";

/**
 * Создаёт MCP сервер с реализованными tools и предоставленным соединением.
 *
 * Соединение и транспорт принадлежат вызывающему коду. Эта функция не открывает
 * сетевые соединения и позволяет проверять MCP protocol без HCM.
 * @param connection - инициализированное соединение или test double
 * @returns сервер без подключённого транспорта
 */
export function createServer(connection: WshcmConnection | { evaluator: WshcmEvaluator }): McpServer {
  const server = new McpServer(
    {
      name: "boristype-wshcm",
      version: packageVersion,
    },
    {
      instructions: [
        "File tools access physical server files, not database-backed URL blobs. Confirm which storage the application uses.",
        "File tools automatically prepare packaged runtime dependencies without a separate download. Use wshcm_runtime_status to inspect expected/installed/loaded identities for the answering process. restart_required blocks file operations until that process is restarted; this server never restarts HCM. XQuery and XML object operations remain available independently. A timeout does not cancel server preparation.",
        "Locate files with search/list, then read with wshcm_read_file before edit or overwrite. Search results and dryRun previews do not grant read coverage. Chain the previous readToken when reading additional ranges; use the newest token for the exact URL. Overwrite requires full coverage. Tokens belong to this MCP instance, not an isolated chat; do not reuse tokens from another instance or bypass reads with delete/create.",
        "After a file mutation attempt, reread before another edit. On Conflict/ReadRequired, refresh the relevant reads instead of repeating stale arguments.",
        "wshcm_xquery accepts server-side XQuery including sql:, without a BorisType DLL. Queries can modify data. Row/output limits do not bound database work, and truncated results are incomplete. After a timeout or lost mutation response, establish the actual outcome before retrying; cancellation and rollback are not guaranteed.",
        "wshcm_execute runs server BorisScript with the connected account's privileges. Use return for the result and experimental print(value) for call-local diagnostics; its usefulness remains under evaluation; platform alert/logs remain in HCM logs. It can modify data without file readToken checks. Script/result errors retain earlier output; transport/response failures have an unknown execution outcome. A timeout does not stop the script or imply rollback. Establish effects before any retry.",
        "On the tested Linux C/PostgreSQL path, negative SQL integers can become null before SOAP; CAST them to text in SQL to preserve the value. SQL NULL and empty text may be indistinguishable. Preserve exact IDs as text or with lossless JSON parsing; JavaScript Number can round large integer tokens.",
        "Package tools manage explicitly addressed schemas and immutable ZIP snapshots on the MCP host. IDs remain decimal strings; includeRelatedObjects follows native XMD/foreign links only, without wvars/mode resolution. Inspect before import; pagination does not limit the default full-snapshot import. Export/inspect write temporary files/reports, import can modify data. Select a UUID operationId before long calls (public UUID handles are canonicalized to lowercase), use get_package_operation after timeout, and never retry automatically; timeout does not cancel native work. No atomic CAS or rollback guarantee.",
        "Object tools use native XML strings: get_form returns expanded schema, get_object returns a full document and readToken, save_object explicitly creates or fully replaces it, and patch_object applies partial edits. Whole replace removes omitted data; patch preserves unmentioned fields and follows keyed or unkeyed array rules. Read the complete object in this MCP instance before patch or replace and reread after every handled attempt, including a patch dryRun or no-op. Preserve exact IDs as decimal strings. Platform types/defaults/hooks still apply. Form loading may execute code. Save errors/timeouts can leave persisted changes; no atomic CAS, rollback, UI permission equivalence or blind retry guarantee.",
      ].join("\n"),
    },
  );

  const api = new WshcmApi(connection.evaluator);
  registerReadFileTool(server, api);
  registerWriteFileTool(server, api);
  registerListDirectoryTool(server, api);
  registerDeleteFileTool(server, api);
  registerSearchFilesTool(server, api);
  registerEditFileTool(server, api);
  registerCreateDirectoryTool(server, api);
  registerMoveFileTool(server, api);
  registerGetFileInfoTool(server, api);
  registerXQueryTool(server, api);
  registerObjectTools(server, api);
  registerPackageTools(server, api);
  registerRuntimeStatusTool(server, api);
  registerSystemInfoTool(server, api);
  registerExecuteTool(server, api);

  return server;
}

/**
 * Запускает MCP через stdin/stdout; первая операция с HCM открывает соединение.
 * @param options - параметры подключения к WSHCM
 */
export async function startServer(options: McpServerOptions): Promise<void> {
  const connection = new ConnectionManager(options);
  let server: McpServer | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let exitCode = 0;

  // EOF and signals can arrive together. Defer work until the shared promise is set:
  // server.close() itself invokes onclose and must not start another cleanup.
  const shutdown = (code = 0): Promise<void> => {
    exitCode = Math.max(exitCode, code);
    shutdownPromise ??= Promise.resolve().then(async () => {
      const cleanup = connection.close().catch((error: unknown) => {
        exitCode = 1;
        process.stderr.write(`Failed to clean up WSHCM connection: ${String(error)}\n`);
      });
      try {
        await server?.close();
      } catch (error) {
        exitCode = 1;
        process.stderr.write(`Failed to close MCP transport: ${String(error)}\n`);
      }
      await cleanup;
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
    server = createServer({ evaluator: connection });
    server.server.onclose = () => {
      void shutdown();
    };
    await server.connect(new StdioServerTransport());
  } catch (error) {
    process.stderr.write(`Failed to start MCP transport: ${String(error)}\n`);
    await shutdown(1);
  }
}
