import { connectionDiagnostic } from "../connection-error.js";
import { WshcmRuntimeError } from "@boristype/ws-client";

/** Format SDK success/errors using the existing MCP text contract. */
export async function toolResult(action: () => Promise<string>, maxErrorLength?: number) {
  try {
    return { content: [{ type: "text" as const, text: await action() }] };
  } catch (error) {
    const connection = connectionDiagnostic(error);
    if (connection || error instanceof WshcmRuntimeError) {
      const runtime =
        error instanceof WshcmRuntimeError
          ? { error: { code: "RuntimeNotReady", message: error.message }, runtimeStatus: error.status }
          : {};
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ...runtime, ...connection }) }],
        isError: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: maxErrorLength === undefined ? message : message.slice(0, maxErrorLength) }],
      isError: true,
    };
  }
}
