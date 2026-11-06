import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { fileText, fileUrl, writeResponse } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";

/** Register bounded create/overwrite with UTF-8 BOM and same-directory replacement. */
export function registerWriteFileTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_write_file",
    {
      description:
        "Create or overwrite a file via BorisType.FileSystem.dll 0.1.0-alpha.3/API 1. Writes UTF-8 with BOM, up to 1 MiB including BOM. Parent must exist; directories, readonly files and links are rejected. Replaces the file through a temporary sibling.",
      inputSchema: z.strictObject({ path: fileUrl, content: fileText.describe("Exact text to write; UTF-8 BOM is added") }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ path, content }) =>
      fileTool(async () => {
        await callManagedFile(connection, "WriteJson", path, { content }, writeResponse);
        return `File written: ${path}`;
      }),
  );
}
