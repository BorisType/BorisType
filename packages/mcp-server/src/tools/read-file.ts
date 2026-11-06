import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { fileUrl, readResponse } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";

/** Register strict UTF-8 reading through the managed library; optionally include the original byte hash and BOM. */
export function registerReadFileTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_read_file",
    {
      description:
        "Read UTF-8 text (up to 1 MiB) via BorisType.FileSystem.dll 0.1.0-alpha.3/API 1. Strips one BOM, preserves whitespace/newlines. Links are rejected. includeMetadata returns JSON with content, sha256 and bom for conditional editing.",
      inputSchema: z.strictObject({ path: fileUrl, includeMetadata: z.boolean().optional().default(false) }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path, includeMetadata }) =>
      fileTool(async () => {
        const data = await callManagedFile(connection, "ReadJson", path, {}, readResponse);
        return includeMetadata ? JSON.stringify(data) : data.content;
      }),
  );
}
