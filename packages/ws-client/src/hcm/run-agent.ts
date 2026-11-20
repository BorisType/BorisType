import { readFileSync } from "node:fs";
import { z } from "zod";
import { WshcmDispatchError } from "../exceptions.js";
import { buildScript } from "./load.js";
import { objectIdSchema } from "./object-id.js";
import type { WshcmEvaluator } from "./types.js";

const defaultWaitTimeoutMs = 5000;
const maxWaitTimeoutMs = 20000;
const reservedParamNames = new Set(["parenttraceid", "__proto__", "prototype", "constructor"]);
const nativeText = (text: string) => text.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(text);
const agentParams = z
  .record(
    z
      .string()
      .min(1)
      .max(128)
      .refine((name) => nativeText(name) && !reservedParamNames.has(name.toLowerCase()), "Invalid or reserved parameter name"),
    z.string().max(4096).refine(nativeText),
  )
  .refine((params) => Object.keys(params).length <= 32 && Buffer.byteLength(JSON.stringify(params), "utf8") <= 32768);

export const runAgentInputSchema = z
  .strictObject({
    agentId: objectIdSchema,
    mode: z.enum(["async", "sync"]).default("async").describe("Return after dispatch, or wait for the agent thread to end."),
    waitTimeoutMs: z
      .number()
      .int()
      .min(1)
      .max(maxWaitTimeoutMs)
      .optional()
      .describe("Sync mode only. Maximum wait after launch in milliseconds. Defaults to 5000. Expiry does not cancel the agent."),
    params: z
      .preprocess((params: Record<string, string>, ctx) => {
        // The record parser drops this property before its key schema can validate it.
        if (params && Object.hasOwn(params, "__proto__")) ctx.addIssue({ code: "custom", message: "Invalid or reserved parameter name" });
        return params;
      }, agentParams)
      .optional()
      .describe("Up to 32 declared agent parameters as strings. Overrides apply to this run only."),
    objectId: objectIdSchema.optional().describe("Object ID exposed to the agent as OBJECT_ID."),
    objectIds: z
      .array(objectIdSchema)
      .max(256)
      .optional()
      .describe("Object IDs exposed to the agent as the semicolon-delimited OBJECTS_ID_STR."),
  })
  .refine(({ mode, waitTimeoutMs }) => mode === "sync" || waitTimeoutMs === undefined, {
    path: ["waitTimeoutMs"],
    error: "waitTimeoutMs requires sync mode",
  });

export type RunAgentInput = z.input<typeof runAgentInputSchema>;

const resultSchema = z.strictObject({ agentId: objectIdSchema, status: z.enum(["accepted", "ended", "wait_timeout"]) });
export type RunAgentResult = z.output<typeof resultSchema>;

const errorFields = z.strictObject({ code: z.string().max(100), message: z.string().max(2000) });
const nativeFailureSchema = z.strictObject({
  agentId: objectIdSchema,
  phase: z.enum(["validation", "launch", "wait"]),
  executionStatus: z.enum(["not_started", "unknown"]),
  error: errorFields,
});
type NativeFailure = z.output<typeof nativeFailureSchema>;

export interface RunAgentErrorDetails extends Omit<NativeFailure, "phase"> {
  phase: NativeFailure["phase"] | "transport" | "response";
}

export class WshcmRunAgentError extends Error {
  constructor(
    readonly details: RunAgentErrorDetails,
    cause?: unknown,
  ) {
    super(details.error.message, { cause });
    this.name = "WshcmRunAgentError";
  }
}

const template = readFileSync(new URL("../../resources/run-agent.bs", import.meta.url), "utf8");

/** Launch an existing server agent through the evaluator once. */
export async function runAgent(evaluator: WshcmEvaluator, input: RunAgentInput): Promise<RunAgentResult> {
  const { agentId, mode, waitTimeoutMs, params, objectId, objectIds } = runAgentInputSchema.parse(input);
  const request = {
    agentId,
    mode,
    waitTimeoutMs: waitTimeoutMs ?? defaultWaitTimeoutMs,
    params: Object.entries(params ?? {}).map(([name, value]) => ({ name, value })),
    objectId: objectId ?? null,
    objectsIds: objectIds?.join(";") ?? "",
  };
  const source = buildScript(template, { request: JSON.stringify(request) });
  let response: unknown;
  try {
    response = await evaluator.eval(source);
  } catch (cause) {
    const message = (cause instanceof Error ? cause.message : String(cause)).slice(0, 2000).toWellFormed();
    throw new WshcmRunAgentError(
      {
        agentId,
        phase: "transport",
        executionStatus: cause instanceof WshcmDispatchError && !cause.dispatched ? "not_started" : "unknown",
        error: { code: "TransportError", message },
      },
      cause,
    );
  }

  try {
    if (typeof response !== "string" || response.length > 16384) throw new Error("Invalid native agent launch response");
    const envelope: unknown = JSON.parse(response);
    const result = resultSchema.safeParse(envelope);
    if (result.success && result.data.agentId === agentId && (result.data.status === "accepted") === (mode === "async")) {
      return result.data;
    }
    const failure = nativeFailureSchema.safeParse(envelope);
    if (failure.success && failure.data.agentId === agentId) throw new WshcmRunAgentError(failure.data);
    throw new Error("Invalid native agent launch receipt");
  } catch (cause) {
    if (cause instanceof WshcmRunAgentError) throw cause;
    throw new WshcmRunAgentError(
      {
        agentId,
        phase: "response",
        executionStatus: "unknown",
        error: { code: "InvalidResponse", message: "HCM did not return a valid agent launch receipt" },
      },
      cause,
    );
  }
}
