import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, WshcmRunAgentError, type WshcmApi } from "@boristype/ws-client";
import { connectionDiagnostic } from "../connection-error.js";

export function registerRunAgentTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_run_agent",
    {
      description:
        "Launch an existing BorisScript server_agent by exact decimal agentId on standalone HCM. params overrides declared string parameters for this run. objectId sets OBJECT_ID and objectIds sets semicolon-delimited OBJECTS_ID_STR. " +
        "Default async returns {agentId,status:'accepted'}. Sync waits for the thread up to waitTimeoutMs (default 5000, max 20000) and returns ended or wait_timeout. Verify the agent's business effects separately. Wait expiry and connection loss do not cancel the run.",
      inputSchema: wshcmSchemas.runAgent,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        return { content: [{ type: "text" as const, text: JSON.stringify(await api.runAgent(input)) }] };
      } catch (error) {
        if (!(error instanceof WshcmRunAgentError)) throw error;
        const body = { ...error.details, ...connectionDiagnostic(error) };
        return { content: [{ type: "text" as const, text: JSON.stringify(body) }], isError: true };
      }
    },
  );
}
