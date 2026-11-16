import type { z } from "zod";
import { executeXQuery as projectXQuery, type XQueryResult } from "../xquery.js";
import { wshcmSchemas } from "./schemas.js";
import type { WshcmEvaluator } from "./types.js";

/** Validate shared SDK input and return the reusable adapter's typed projection. */
export async function executeXQuery(evaluator: WshcmEvaluator, input: z.input<typeof wshcmSchemas.xquery>): Promise<XQueryResult> {
  const { query, maxRows } = wshcmSchemas.xquery.parse(input);
  return projectXQuery(evaluator, query, { maxRows });
}
