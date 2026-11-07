import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { fileUrl, listResponse } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";

/** Register immediate directory listing; links are marked as data and never traversed. */
export function registerListDirectoryTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_list_directory",
    {
      description:
        "List immediate entries in ordinal order via BorisType.FileSystem.dll 0.1.0-alpha.4/API 2. Returns a JSON array of name/isDirectory and isSymbolicLink=true for links. At most 10000 entries; overflow is an error. Root links and file roots are rejected.",
      inputSchema: z.strictObject({ path: fileUrl }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path }) =>
      fileTool(async () => {
        const data = await callManagedFile(connection, "ListJson", path, {}, listResponse);
        return JSON.stringify(data.entries);
      }),
  );
}
