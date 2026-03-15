import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";

/**
 * Регистрирует tool `wshcm_delete_file` — удаление файла на WSHCM сервере.
 *
 * Удаляет файл по указанному серверному URL (x-local://).
 */
export function registerDeleteFileTool(server: McpServer, connection: WshcmConnection): void {
  server.tool(
    "wshcm_delete_file",
    "Delete a file from the WebSoft HCM server by its x-local:// URL path",
    { path: z.string().describe("Server file URL to delete (e.g. x-local://wt/web/old.bs)") },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    async ({ path }) => {
      const escapedPath = path.replace(/\\/g, "\\\\\\\\").replace(/'/g, "\\\\'");
      await connection.evaluator.eval(`DeleteFile('${escapedPath}'); return;`);
      return {
        content: [{ type: "text" as const, text: `File deleted: ${path}` }],
      };
    },
  );
}
