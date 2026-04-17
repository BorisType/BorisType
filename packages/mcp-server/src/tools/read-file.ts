import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";

const scriptTemplate = readFileSync(new URL("../../resources/read-file.bs", import.meta.url), "utf-8");

/**
 * Регистрирует tool `wshcm_read_file` — чтение файла на WSHCM сервере.
 *
 * Читает содержимое файла по указанному серверному URL (x-local://).
 */
export function registerReadFileTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_read_file",
    {
      description: "Read a file from the WebSoft HCM server by its x-local:// URL path",
      inputSchema: { path: z.string().describe("Server file URL (e.g. x-local://wt/web/app.bs)") },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path }) => {
      try {
        const script = buildScript(scriptTemplate, { path });
        const content = await connection.evaluator.eval(script);
        return { content: [{ type: "text" as const, text: String(content ?? "") }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );
}
