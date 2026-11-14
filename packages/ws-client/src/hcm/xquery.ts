import { readFileSync } from "node:fs";
import { z } from "zod";
import { buildScript } from "./load.js";
import { wshcmSchemas } from "./schemas.js";
import type { WshcmEvaluator } from "./types.js";
const scriptTemplate = readFileSync(new URL("../../resources/xquery.bs", import.meta.url), "utf8");
const maxResponseBytes = 262144;
const response = z
  .strictObject({
    rows: z.array(z.unknown()).max(1000),
    returnedRows: z.number().int().min(0).max(1000),
    truncated: z.boolean(),
    limitReason: z.enum(["rows", "output"]).nullable(),
  })
  .refine((value) => value.rows.length === value.returnedRows && value.truncated === (value.limitReason !== null));

/** Validate the envelope while preserving original platform JSON numeric tokens. */
export async function executeXQuery(evaluator: WshcmEvaluator, input: z.input<typeof wshcmSchemas.xquery>): Promise<string> {
  const { query, maxRows } = wshcmSchemas.xquery.parse(input);
  const wire = await evaluator.eval(buildScript(scriptTemplate, { query, maxRows: String(maxRows) }));
  // JSON string escaping expands a code unit by at most six characters.
  if (typeof wire !== "string" || Buffer.byteLength(wire, "utf8") > maxResponseBytes * 6 + 2) {
    throw new Error("Expected a bounded JSON string carrier from WSHCM XQuery");
  }
  const text: unknown = JSON.parse(wire);
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maxResponseBytes) {
    throw new Error("XQuery response must be JSON text within 256 KiB");
  }
  const result = response.parse(JSON.parse(text));
  if (result.returnedRows > maxRows || (result.limitReason === "rows" && result.returnedRows !== maxRows)) {
    throw new Error("XQuery response exceeds or contradicts maxRows");
  }
  return text;
}
