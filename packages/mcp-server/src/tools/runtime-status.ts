import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, type WshcmApi } from "@boristype/ws-client";
import { toolResult } from "./result.js";

/** Preparing status can install package assets and load code in the answering HCM process. */
export function registerRuntimeStatusTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_runtime_status",
    {
      description:
        "Automatically prepare the packaged file runtime and return status, reason, changed, expected/installed/loaded identities and process. Call with {} to diagnose a file operation. Preparation may install files and load assemblies. " +
        "ready applies to the answering HCM process. restart_required means the process still has another build loaded. After restarting that process, check again. blocked carries a diagnostic reason. Timeout does not cancel preparation. For HCM and database versions use wshcm_get_system_info.",
      inputSchema: wshcmSchemas.runtimeStatus,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    () => toolResult(async () => JSON.stringify(await api.runtime.ensure())),
  );
}
