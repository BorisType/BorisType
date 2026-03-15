import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";

/**
 * Регистрирует tool `wshcm_read_file` — чтение файла на WSHCM сервере.
 *
 * Читает содержимое файла по указанному серверному URL (x-local://).
 */
export function registerReadFileTool(server: McpServer, connection: WshcmConnection): void {
  server.tool(
    "wshcm_read_file",
    "Read a file from the WebSoft HCM server by its x-local:// URL path",
    { path: z.string().describe("Server file URL (e.g. x-local://wt/web/app.bs)") },
    { readOnlyHint: true, destructiveHint: false },
    async ({ path }) => {
      const escapedPath = path.replace(/\\/g, "\\\\\\\\").replace(/'/g, "\\\\'");
      const content = await connection.evaluator.eval(
        `return tools.get_url_text_server('${escapedPath}');`,
      );
      return { content: [{ type: "text" as const, text: String(content ?? "") }] };
    },
  );
}
