import { WshcmRuntimeError } from "./runtime/contracts.js";
import { WshcmRuntime, type WshcmRuntimeOptions } from "./runtime/runtime.js";
import type { z } from "zod";
import { WshcmFiles } from "./files.js";
import { WshcmPackages } from "./packages/service.js";
import { WshcmObjects } from "./objects.js";
import { executeXQuery } from "./xquery.js";
import { getSystemInfo, type SystemInfoResult } from "./system-info.js";
import { executeBorisScript, type ExecutionResult } from "./execute.js";
import type { XQueryResult } from "../xquery.js";
import type { wshcmSchemas } from "./schemas.js";
import type { WshcmEvaluator } from "./types.js";

/** Shared HCM operations. The caller owns the evaluator's initialization and lifecycle. */
export class WshcmApi {
  readonly files: WshcmFiles;
  readonly objects: WshcmObjects;
  readonly packages: WshcmPackages;
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
    this.packages = new WshcmPackages(evaluator);
  }

  /** Return bounded typed rows: integers are bigint, reals number, native dates ISO strings. */
  xquery(input: z.input<typeof wshcmSchemas.xquery>): Promise<XQueryResult> {
    return executeXQuery(this.evaluator, input);
  }

  /** Read the native About report; includeReport opts into the full unredacted text. */
  systemInfo(input: z.input<typeof wshcmSchemas.systemInfo> = {}): Promise<SystemInfoResult> {
    return getSystemInfo(this.evaluator, input);
  }

  /** Execute BorisScript once; native failures retain print output, transport failures have an unknown outcome. */
  execute(input: z.input<typeof wshcmSchemas.execute>): Promise<ExecutionResult> {
    return executeBorisScript(this.evaluator, input);
  }
}
