import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";
import { searchInput, searchResponse } from "./search-contract.js";

const scriptTemplate = readFileSync(new URL("../../resources/search-files.bs", import.meta.url), "utf-8");

/** Register bounded filename/content search through the BS resolver and standalone .NET library. */
export function registerSearchFilesTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_search_files",
    {
      description:
        "Search file names by glob, or UTF-8 file contents by literal/line regex, below a WebSoft HCM x-local:// directory. " +
        "Requires BorisType.FileSystem.dll 0.1.0-alpha.2 or newer (API 1). Returns root URL, relative paths, optional line/column/text, " +
        "work/skip counters and limitReason. Inspect skipped and limitReason for incomplete coverage. Does not follow links.",
      inputSchema: searchInput,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path, ...request }) => {
      try {
        const wire = await connection.evaluator.eval(buildScript(scriptTemplate, { path, request: JSON.stringify(request) }));
        if (typeof wire !== "string") throw new Error("Expected JSON string carrier from WSHCM search");
        const json: unknown = JSON.parse(wire);
        if (typeof json !== "string") throw new Error("Expected a string DLL response inside the search carrier");
        const result = searchResponse.parse(JSON.parse(json));
        let text = JSON.stringify({ root: path, ...result });
        if (Buffer.byteLength(text, "utf8") > 262144) {
          // The DLL cannot account for the platform URL. Trim using actual final UTF-8 bytes.
          const matches: typeof result.matches = [];
          let bytes = Buffer.byteLength(JSON.stringify({ root: path, ...result, matches, limitReason: "output" }), "utf8");
          for (const match of result.matches) {
            const size = Buffer.byteLength(JSON.stringify(match), "utf8") + (matches.length ? 1 : 0);
            if (bytes + size > 262144) break;
            matches.push(match);
            bytes += size;
          }
          text = JSON.stringify({ root: path, ...result, matches, limitReason: "output" });
        }
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
      }
    },
  );
}
