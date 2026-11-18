import { readFileSync } from "node:fs";
import type { z } from "zod";
import { WshcmDispatchError } from "../exceptions.js";
import type { WshcmValue } from "../types.js";
import { carrierArray, carrierRecord, decodeCarrierString, projectionDecoder, projectionSource } from "../value-projection.js";
import { wshcmSchemas } from "./schemas.js";
import type { WshcmEvaluator } from "./types.js";

interface ExecutionOutput {
  output: string[];
  outputTruncated: boolean;
}
export type ExecutionResult = ExecutionOutput &
  ({ ok: true; value: WshcmValue } | { ok: false; error: { phase: "execution" | "result"; message: string } });

export interface ExecutionErrorDetails {
  phase: "transport" | "response";
  executionStatus: "unknown" | "not_started";
  error: { code: "TransportError" | "InvalidResponse"; message: string };
}

/** No server acknowledgement is available; this error never implies cancellation/rollback. */
export class WshcmExecutionError extends Error {
  readonly details: ExecutionErrorDetails;
  constructor(phase: ExecutionErrorDetails["phase"], cause: unknown) {
    const message = (cause instanceof Error ? cause.message : String(cause)).slice(0, 2000).toWellFormed();
    const unstarted = phase === "transport" && cause instanceof WshcmDispatchError && !cause.dispatched;
    super(`Execution ${unstarted ? "not started" : "outcome unknown"} (${phase}): ${message}`, { cause });
    this.name = "WshcmExecutionError";
    this.details = {
      phase,
      executionStatus: unstarted ? "not_started" : "unknown",
      error: { code: phase === "transport" ? "TransportError" : "InvalidResponse", message },
    };
  }
}

const template = readFileSync(new URL("../../resources/execute.bs", import.meta.url), "utf8");

/** Execute once in the server account context, without a file DLL or automatic retry. */
export async function executeBorisScript(evaluator: WshcmEvaluator, input: z.input<typeof wshcmSchemas.execute>): Promise<ExecutionResult> {
  const { code } = wshcmSchemas.execute.parse(input);
  const literal = JSON.stringify(code)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const source = template.replace(/\$\{(codeLiteral|projectionSource)\}/g, (_, name: string) =>
    name === "codeLiteral" ? literal : projectionSource,
  );
  let response: unknown;
  try {
    response = await evaluator.eval(source);
  } catch (cause) {
    throw new WshcmExecutionError("transport", cause);
  }
  try {
    if (
      !carrierRecord(response, ["ok", "value", "output", "outputTruncated", "error"]) ||
      typeof response.ok !== "boolean" ||
      !carrierArray(response.output) ||
      response.output.length > 256 ||
      typeof response.outputTruncated !== "boolean"
    ) {
      throw new Error("Invalid execution response envelope");
    }
    const output = response.output.map(decodeCarrierString);
    if (Buffer.byteLength(JSON.stringify(output), "utf8") > 65536) throw new Error("Execution diagnostics exceed 64 KiB");
    let result: ExecutionResult;
    if (response.ok) {
      if (response.error !== null) throw new Error("Successful execution response contains an error");
      result = { ok: true, value: projectionDecoder()(response.value, 0), output, outputTruncated: response.outputTruncated };
    } else {
      if (
        response.value !== null ||
        !carrierRecord(response.error, ["phase", "message"]) ||
        (response.error.phase !== "execution" && response.error.phase !== "result")
      )
        throw new Error("Invalid native execution error");
      const message = decodeCarrierString(response.error.message);
      if ([...message].length > 2000) throw new Error("Execution error message exceeds 2000 characters");
      result = { ok: false, error: { phase: response.error.phase, message }, output, outputTruncated: response.outputTruncated };
    }
    // Conservative bound independent of the caller's integer/undefined JSON policy.
    const bounded = JSON.stringify(result, (_, value: unknown) =>
      typeof value === "bigint"
        ? String(value)
        : value === undefined
          ? null
          : typeof value === "number" && !Number.isFinite(value)
            ? String(value)
            : value,
    );
    if (Buffer.byteLength(bounded, "utf8") > 262144) throw new Error("Execution response exceeds 256 KiB UTF-8");
    return result;
  } catch (cause) {
    throw new WshcmExecutionError("response", cause);
  }
}
