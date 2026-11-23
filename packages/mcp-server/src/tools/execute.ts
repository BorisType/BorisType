import { connectionDiagnostic } from "../connection-error.js";
import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, WshcmExecutionError, type WshcmApi } from "@boristype/ws-client";

export function registerExecuteTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_execute",
    {
      description:
        "Run one server-side BorisScript fragment under the connected HCM account. Use return for value and experimental print(value) for call-local output. Platform alert and library logs stay in HCM. For an existing configured agent use wshcm_run_agent. " +
        "Returns ok, value or error, output and outputTruncated. Script and result errors retain earlier output. Safe integers are JSON numbers, larger integers decimal strings, undefined becomes null. XML/date use the XQuery projection. Nonfinite real values fail presentation. " +
        "Code up to 64 KiB UTF-8, result depth 32/10000 values/48000 carrier characters, diagnostics 256 messages/16000 encoded characters, final JSON 256 KiB. No file DLL needed. Code may modify data independently of readTokens. A timeout or failed result does not undo or stop it. Establish effects before retrying.",
      inputSchema: wshcmSchemas.execute,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input) => {
      try {
        const result = await api.execute(input);
        let body: unknown = result;
        let isError = !result.ok;
        let text: string;
        try {
          text = JSON.stringify(body, (_, value: unknown) => {
            if (typeof value === "bigint")
              return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : String(value);
            if (typeof value === "number" && !Number.isFinite(value))
              throw new Error("Nonfinite real values cannot be represented in MCP JSON");
            return value === undefined ? null : value;
          });
          if (Buffer.byteLength(text, "utf8") > 262144) throw new Error("Execution response exceeds 256 KiB UTF-8");
        } catch (cause) {
          body = {
            ok: false,
            output: result.output,
            outputTruncated: result.outputTruncated,
            error: { phase: "presentation", message: cause instanceof Error ? cause.message : String(cause) },
          };
          text = JSON.stringify(body);
          isError = true;
        }
        return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
      } catch (cause) {
        const body =
          cause instanceof WshcmExecutionError
            ? { ok: false, ...cause.details, ...connectionDiagnostic(cause) }
            : {
                ok: false,
                phase: "response",
                executionStatus: "unknown",
                error: {
                  code: "ExecutionError",
                  message: (cause instanceof Error ? cause.message : String(cause)).slice(0, 2000).toWellFormed(),
                },
              };
        return { content: [{ type: "text" as const, text: JSON.stringify(body) }], isError: true };
      }
    },
  );
}
