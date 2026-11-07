import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { WshcmConnection } from "../connection.js";
import { fileUrl } from "./file-contract.js";
import { callManagedFile, fileTool } from "./managed-files.js";
import type { ReadState } from "./read-state.js";

/** Register mkdir-p through the managed library; never replace files or traverse links. */
export function registerCreateDirectoryTool(server: McpServer, connection: WshcmConnection, reads: ReadState): void {
  server.registerTool(
    "wshcm_create_directory",
    {
      description:
        "Create a directory and missing parents via DLL alpha.4/API 2. Existing directory succeeds with created=false. Files and symlink/junction ancestors are rejected. Creation of a parent chain is not transactional.",
      inputSchema: z.strictObject({ path: fileUrl }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ path }) =>
      fileTool(() =>
        reads.run(async () =>
          JSON.stringify(
            await callManagedFile(
              connection,
              "CreateDirectoryJson",
              path,
              {},
              z.strictObject({ apiVersion: z.literal(2), created: z.boolean() }),
            ),
          ),
        ),
      ),
  );
}
