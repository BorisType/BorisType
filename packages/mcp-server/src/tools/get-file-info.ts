import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { fileUrl } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";

const infoResponse = z
  .strictObject({
    apiVersion: z.literal(2),
    name: z.string(),
    isDirectory: z.boolean(),
    sizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    modifiedUtc: z.iso.datetime(),
  })
  .refine((data) => data.isDirectory === (data.sizeBytes === undefined));

/** Register metadata without content reads or read grants, including binary and large files. */
export function registerGetFileInfoTool(server: McpServer, connection: WshcmConnection): void {
  server.registerTool(
    "wshcm_get_file_info",
    {
      description:
        "Get file/directory name, type, UTC modification time and sizeBytes for files via DLL alpha.4/API 2. Does not read content or grant a readToken. Supports binary files and files larger than the text budget. Links/junctions are rejected.",
      inputSchema: z.strictObject({ path: fileUrl }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ path }) => fileTool(async () => JSON.stringify(await callManagedFile(connection, "InfoJson", path, {}, infoResponse))),
  );
}
