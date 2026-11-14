import { WshcmRuntimeError } from "@boristype/ws-client";

/** Format SDK success/errors using the existing MCP text contract. */
export async function toolResult(action: () => Promise<string>, maxErrorLength?: number) {
  try {
    return { content: [{ type: "text" as const, text: await action() }] };
  } catch (error) {
    if (error instanceof WshcmRuntimeError) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: { code: "RuntimeNotReady", message: error.message }, runtimeStatus: error.status }),
          },
        ],
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
