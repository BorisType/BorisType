import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

/** Preparing status can install package assets and load code in the answering HCM process. */
export function registerRuntimeStatusTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_runtime_status",
    {
      description:
        "Automatically prepare the packaged BorisType file runtime and report expected, installed and actually loaded identities for the answering process. May create immutable server files and load assemblies; no separate DLL download is required. restart_required means the answering HCM process still uses an older build; this tool does not restart it. One process does not establish cluster-wide readiness. A timeout does not cancel server preparation.",
      inputSchema: wshcmSchemas.runtimeStatus,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    () => toolResult(async () => JSON.stringify(await api.runtime.ensure())),
  );
}
