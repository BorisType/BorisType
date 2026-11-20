import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, WshcmRunAgentError, type WshcmApi } from "@boristype/ws-client";
import { connectionDiagnostic } from "../connection-error.js";

export function registerRunAgentTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_run_agent",
    {
      description:
        "Launch an existing BorisScript server agent on a standalone HCM server by its exact ID. Async returns accepted. Sync waits up to waitTimeoutMs and returns ended or wait_timeout. Ended describes the thread lifecycle. A wait or connection timeout does not cancel the run. Pass declared string params to override defaults for this run, and optional object context IDs. Check the agent's actual effects before retrying an unknown outcome.",
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
