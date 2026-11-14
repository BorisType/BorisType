import type { z } from "zod";
import { WshcmFiles } from "./files.js";
import { WshcmObjects } from "./objects.js";
import { executeXQuery } from "./xquery.js";
import type { wshcmSchemas } from "./schemas.js";
import type { WshcmEvaluator } from "./types.js";

/** Shared HCM operations. The caller owns the evaluator's initialization and lifecycle. */
export class WshcmApi {
  readonly files: WshcmFiles;
  readonly objects: WshcmObjects;

  constructor(private readonly evaluator: WshcmEvaluator) {
    this.files = new WshcmFiles(evaluator);
    this.objects = new WshcmObjects(evaluator);
  }

  /** Return original JSON text to preserve large IDs and decimal tokens. */
  xquery(input: z.input<typeof wshcmSchemas.xquery>): Promise<string> {
    return executeXQuery(this.evaluator, input);
  }
}
