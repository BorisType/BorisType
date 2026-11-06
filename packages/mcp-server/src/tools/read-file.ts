import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
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
      inputSchema: z.object({ path: z.string().describe("Server file URL (e.g. x-local://wt/web/app.bs)") }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path }) => {
      try {
        const script = buildScript(scriptTemplate, { path });
        const result = await connection.evaluator.eval(script);
        if (typeof result !== "string") {
          throw new Error("Expected a string file result from WSHCM");
        }
        // JSON protects CRLF from native SOAP string serialization. Do not coerce
        // missing or malformed results into a successful empty file.
        const content: unknown = JSON.parse(result);
        if (typeof content !== "string") {
          throw new Error("Expected a string file result from WSHCM");
        }
        // A leading UTF-8 signature is file metadata, matching native LoadUrlText.
        return { content: [{ type: "text" as const, text: content.replace(/^\uFEFF/, "") }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: message }], isError: true };
      }
    },
  );
}
