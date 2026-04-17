import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/delete-file.bs", import.meta.url), "utf-8");

/**
 * Регистрирует tool `wshcm_delete_file` — удаление файла на WSHCM сервере.
 *
 * Удаляет файл по указанному серверному URL (x-local://).
 */
export function registerDeleteFileTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_delete_file",
    {
      description: "Delete a file from the WebSoft HCM server by its x-local:// URL path",
      inputSchema: {
        path: z.string().describe("Server file URL to delete (e.g. x-local://wt/web/old.bs)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ path }) => {
      try {
        const script = buildScript(scriptTemplate, { path });
        await connection.evaluator.eval(script);
        return {
          content: [{ type: "text" as const, text: `File deleted: ${path}` }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );
}
