import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";

/**
 * Регистрирует tool `wshcm_write_file` — запись файла на WSHCM сервере.
 *
 * Создаёт или перезаписывает файл по указанному серверному URL (x-local://).
 */
export function registerWriteFileTool(server: McpServer, connection: WshcmConnection): void {
  server.tool(
    "wshcm_write_file",
    "Write content to a file on the WebSoft HCM server by its x-local:// URL path. Creates the file if it does not exist, overwrites if it does.",
    {
      path: z.string().describe("Server file URL (e.g. x-local://wt/web/app.bs)"),
      content: z.string().describe("File content to write"),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async ({ path, content }) => {
      // Передаём контент как аргумент через callMethod, чтобы избежать проблем с экранированием
      await connection.client.callMethod("tools", "put_url_text_server", [path, content]);
      return {
        content: [{ type: "text" as const, text: `File written: ${path}` }],
      };
    },
  );
}
