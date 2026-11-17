import { readFileSync } from "node:fs";
import { z } from "zod";
import { buildScript } from "../load.js";
import type { WshcmEvaluator } from "../types.js";
import { WshcmPackageError } from "./contracts.js";
const template = readFileSync(new URL("../../../resources/package-operation.bs", import.meta.url), "utf8");
const max = 40 * 1024 * 1024;
const envelope = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), body: z.unknown() }),
  z.strictObject({
    ok: z.literal(false),
    code: z.string().max(100),
    message: z.string().max(2000),
    phase: z.string().max(32),
    status: z.enum(["not_attempted", "unknown", "failed"]),
  }),
]);
/** Exactly one dispatch. A malformed carrier after dispatch is an unknown outcome. */
export async function packageNative<T>(evaluator: WshcmEvaluator, request: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const operationId = typeof request.operationId === "string" ? request.operationId : undefined;
  const json = JSON.stringify(request);
  if (Buffer.byteLength(json) > max)
    throw new WshcmPackageError({ code: "InputLimit", message: "Native request exceeds bound", phase: "input", status: "not_attempted" });
  try {
    const wire = await evaluator.eval(buildScript(template, { request: json }));
    if (typeof wire !== "string" || Buffer.byteLength(wire) > max * 6 + 2) throw new Error("Invalid native carrier");
    const text: unknown = JSON.parse(wire);
    if (typeof text !== "string" || Buffer.byteLength(text) > max) throw new Error("Invalid native envelope size");
    const result = envelope.parse(JSON.parse(text));
    if (!result.ok) throw new WshcmPackageError({ ...result, ...(operationId ? { operationId } : {}) });
    return schema.parse(result.body);
  } catch (error) {
    if (error instanceof WshcmPackageError) throw error;
    throw new WshcmPackageError({
      code: "TransportError",
      message: String(error).slice(0, 2000),
      phase: "transport",
      status: "unknown",
      ...(operationId ? { operationId } : {}),
    });
  }
}
