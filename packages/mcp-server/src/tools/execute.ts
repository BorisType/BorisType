import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, WshcmExecutionError, type WshcmApi } from "@boristype/ws-client";

export function registerExecuteTool(server: McpServer, api: WshcmApi): void {
  server.registerTool(
    "wshcm_execute",
    {
      description:
        "Execute server-side BorisScript once, with the connected HCM account's privileges. Use return for the value. Experimental print(value) provides call-local diagnostic messages; its practical usefulness is still under evaluation and it may change or be removed. Returns ok, value or error, output and outputTruncated; native script/result errors retain earlier output. Platform alert/logs remain in HCM logs, not captured here. No BorisType DLL required. Code is limited to 64 KiB UTF-8; result projection to depth 32/10000 values/48000 carrier characters, diagnostics to 256 messages/16000 encoded characters, final response to 256 KiB UTF-8. Safe integers are JSON numbers, larger integers decimal strings; undefined becomes null and nonfinite real values cause a presentation error. Native XML/date use the XQuery projection. May modify data; not sandboxed, read-only or idempotent. Client timeout does not stop server code or imply rollback. Unknown outcomes are not retried; establish actual effects before retrying.",
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
            ? { ok: false, ...cause.details }
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
