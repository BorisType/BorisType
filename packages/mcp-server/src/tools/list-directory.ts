import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/list-directory.bs", import.meta.url), "utf-8");

/**
 * Регистрирует tool `wshcm_list_directory` — листинг директории на WSHCM сервере.
 *
 * Возвращает список файлов и папок по указанному серверному URL (x-local://).
 */
export function registerListDirectoryTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_list_directory",
    {
      description: "List files and directories at the given x-local:// URL path on the WebSoft HCM server",
      inputSchema: { path: z.string().describe("Server directory URL (e.g. x-local://wt/web/)") },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path }) => {
      try {
        const script = buildScript(scriptTemplate, { path });
        const result = await connection.evaluator.eval(script);
        return { content: [{ type: "text" as const, text: String(result ?? "[]") }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );
}
