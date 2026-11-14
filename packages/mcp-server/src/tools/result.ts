/** Format SDK success/errors using the existing MCP text contract. */
export async function toolResult(action: () => Promise<string>, maxErrorLength?: number) {
  try {
    return { content: [{ type: "text" as const, text: await action() }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: maxErrorLength === undefined ? message : message.slice(0, maxErrorLength) }],
      isError: true,
    };
  }
}
