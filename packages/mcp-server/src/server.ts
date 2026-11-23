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
  registerRunAgentTool,
} from "./tools/index.js";

/**
 * Создаёт MCP сервер с реализованными tools и предоставленным соединением.
 *
 * Соединение и транспорт принадлежат вызывающему коду. Эта функция не открывает
 * сетевые соединения и позволяет проверять MCP protocol без HCM.
 * @param connection - инициализированное соединение или test double
 * @param options - локальный каталог package artifacts
 * @returns сервер без подключённого транспорта
 */
export function createServer(
  connection: WshcmConnection | { evaluator: WshcmEvaluator },
  options: Pick<McpServerOptions, "packageArtifactDirectory" | "packageImportDirectory"> = {},
): McpServer {
  const server = new McpServer(
    {
      name: "boristype-wshcm",
      version: packageVersion,
    },
    {
      instructions: [
        "Use wshcm_get_system_info for the answering HCM environment. tools/list is available while HCM is offline. The next HCM call checks the connection on demand.",
        "Discover document types and catalog names with wshcm_list_object_types, find IDs with wshcm_xquery, and read XML with wshcm_get_object. Pass object IDs as exact decimal strings. Use wshcm_get_form for XMD and wshcm_get_custom_field_definitions for configured fields/pages; its list mode identifies the template selector. Use wshcm_list_object_data_types to find relationships by either object type.",
        "Read a document before patch, whole replace or trash deletion. Reread after a handled attempt, including XML patch dryRun or no-op. For custom-field definitions read the scope and use its revision; change instance values through wshcm_patch_object.",
        "File tools prepare their DLL automatically and access physical server files. An HCM URL can instead be served from database-backed storage. Use wshcm_runtime_status for per-process DLL diagnostics. Locate with search/list, then use wshcm_read_file. Chain readToken across ranges for the exact URL. Edit needs coverage of the replaced text; overwrite needs full coverage. A file dryRun preserves the token and its previous coverage. Do not bypass the read requirement with delete/create. Reread after a mutation attempt or conflict. Tokens belong to this MCP instance, which may be shared across chats.",
        "For ZIP transfers use export, then inspect on the target, then import by inspectionId. Stage external ZIPs in the target MCP host's configured import directory before passing localPath. Preview pages do not restrict the default import. Choose an operationId before dispatch and query wshcm_get_package_operation if the result is lost.",
        "wshcm_xquery, wshcm_execute and wshcm_run_agent use the connected account and can change data. Check truncated on query results. Row limits bound output only. Timeout or loss of a response does not cancel server work. Observe saved data, the expected agent effects or the package receipt before deciding whether to retry. Compare-before-save is not atomic with external writers.",
      ].join("\n"),
    },
  );

  const api = new WshcmApi(connection.evaluator, undefined, {
    artifactDirectory: options.packageArtifactDirectory,
    importDirectory: options.packageImportDirectory,
  });
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
  registerRunAgentTool(server, api);

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
    server = createServer({ evaluator: connection }, options);
    server.server.onclose = () => {
      void shutdown();
    };
    await server.connect(new StdioServerTransport());
  } catch (error) {
    process.stderr.write(`Failed to start MCP transport: ${String(error)}\n`);
    await shutdown(1);
  }
}
