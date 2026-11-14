import { WshcmRuntimeError } from "./runtime/contracts.js";
import { WshcmRuntime, type WshcmRuntimeOptions } from "./runtime/runtime.js";
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
  readonly runtime: WshcmRuntime;

  constructor(
    private readonly evaluator: WshcmEvaluator,
    runtimeOptions: WshcmRuntimeOptions = {},
  ) {
    this.runtime = new WshcmRuntime(evaluator, runtimeOptions);
    this.files = new WshcmFiles({
      eval: async (code) => {
        const status = await this.runtime.requireReady();
        if (status.expected?.id !== "BorisType.FileSystem" || status.expected.apiVersion !== 2) {
          throw new WshcmRuntimeError({ ...status, status: "blocked", reason: "UnexpectedComponent" });
        }
        return evaluator.eval(code);
      },
    });
    this.objects = new WshcmObjects(evaluator);
  }

  /** Return original JSON text to preserve large IDs and decimal tokens. */
  xquery(input: z.input<typeof wshcmSchemas.xquery>): Promise<string> {
    return executeXQuery(this.evaluator, input);
  }
}
