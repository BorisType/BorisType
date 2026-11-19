import { WshcmDispatchError, WshcmRequestError } from "@boristype/ws-client";
import type { McpServerOptions } from "./types.js";

export type ConnectionTarget = Pick<McpServerOptions, "host" | "port" | "https">;
export class HcmConnectionError extends WshcmDispatchError {
  readonly diagnostic;

  constructor(target: ConnectionTarget, cause: unknown, dispatched: boolean, closed = false) {
    const request = cause instanceof WshcmRequestError ? cause : undefined;
    const state = closed ? "closed" : (request?.kind ?? "evaluator");
    const message = closed ? "The HCM connection is closed" : (request?.message ?? "The HCM evaluator could not be verified");
    super(message, dispatched, { cause });
    this.diagnostic = {
      error: { code: state === "authentication" ? "HcmAuthenticationFailed" : "HcmUnavailable", message },
      connection: {
        state,
        target,
        retryable: state !== "authentication" && !closed,
        ...(request?.statusCode ? { statusCode: request.statusCode } : {}),
      },
    };
  }
}

/** SDK operation errors retain native details and wrap evaluator errors as their cause. */
export function connectionDiagnostic(error: unknown) {
  const seen = new Set<Error>();
  while (error instanceof Error && !seen.has(error)) {
    if (error instanceof HcmConnectionError) return error.diagnostic;
    seen.add(error);
    error = error.cause;
  }
  return undefined;
}
