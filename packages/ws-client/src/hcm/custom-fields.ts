import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { WshcmDispatchError } from "../exceptions.js";
import { buildScript } from "./load.js";
import { WshcmObjectError, type WshcmObjectErrorDetails } from "./object-error.js";
import { objectIdSchema } from "./object-id.js";
import type { WshcmEvaluator } from "./types.js";

const template = readFileSync(new URL("../../resources/custom-field-definitions.bs", import.meta.url), "utf8");
const registryBytes = 512 * 1024;
const definitionBytes = 256 * 1024;
const requestBytes = 2 * 1024 * 1024;
const validText = (value: string) => value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value);
const key = z
  .string()
  .max(128)
  .refine((value) => value.trim().length > 0 && validText(value) && !/[\r\n\t]/.test(value));
const text = z.string().max(4096).refine(validText);
const scopeSchema = z.strictObject({
  objectType: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/),
  templateId: objectIdSchema.optional(),
});
const fieldProperties = z.strictObject({
  title: text,
  type: key,
  required: z.boolean(),
  showOnPortal: z.boolean(),
  pageId: key.nullable(),
  options: z.array(text).max(256),
  catalog: key.nullable(),
});
const moveAnchor = { before: key.optional(), after: key.optional() };
const operationSchema = z
  .discriminatedUnion("op", [
    z.strictObject({ op: z.literal("upsertField"), name: key, set: fieldProperties.partial() }),
    z.strictObject({ op: z.literal("removeField"), name: key }),
    z.strictObject({ op: z.literal("moveField"), name: key, ...moveAnchor }),
    z.strictObject({ op: z.literal("upsertPage"), id: key, set: z.strictObject({ title: text }) }),
    z.strictObject({ op: z.literal("removePage"), id: key }),
    z.strictObject({ op: z.literal("movePage"), id: key, ...moveAnchor }),
  ])
  .superRefine((op, context) => {
    if (op.op !== "moveField" && op.op !== "movePage") return;
    const target = op.op === "moveField" ? op.name : op.id;
    if ((op.before === undefined) === (op.after === undefined) || (op.before ?? op.after) === target) {
      context.addIssue({ code: "custom", message: "A move needs exactly one before or after key different from the moved key." });
    }
  });

export const customFieldSchemas = {
  get: z.strictObject({
    scope: scopeSchema.describe(
      "Use objectType for a common definition or objectType and exact templateId for an existing template owner.",
    ),
  }),
  patch: z.strictObject({
    scope: scopeSchema,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    dryRun: z.boolean().default(false),
    operations: z.array(operationSchema).min(1).max(100),
  }),
} as const;

const snapshotSchema = z.strictObject({
  url: z.string().min(1).max(2048),
  xml: z.string().min(1).max(registryBytes),
});
// Existing native strings can exceed the editor's input limits. Bound the entire read projection.
const nativeText = z.string().refine(validText);
const definitionSchema = z.strictObject({
  exists: z.boolean(),
  fields: z
    .array(
      fieldProperties.extend({
        name: nativeText,
        title: nativeText,
        type: nativeText,
        pageId: nativeText.nullable(),
        catalog: nativeText.nullable(),
        options: z.array(nativeText).max(256),
      }),
    )
    .max(1000),
  pages: z.array(z.strictObject({ id: nativeText, title: nativeText })).max(1000),
  fieldTypes: z.array(z.strictObject({ id: nativeText, title: nativeText })).max(128),
});
const phase = z.enum(["input", "read", "validate", "save", "readback"]);
const writeStatus = z.enum(["not_attempted", "unknown", "saved"]);
const carrier = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    snapshot: snapshotSchema,
    definition: definitionSchema,
    changed: z.boolean().optional(),
    writeStatus: z.enum(["not_attempted", "saved"]).optional(),
  }),
  z.strictObject({
    ok: z.literal(false),
    phase,
    writeStatus,
    error: z.strictObject({ code: z.string().min(1).max(80), message: z.string().max(2000) }),
  }),
]);

export type CustomFieldScope = z.output<typeof scopeSchema>;
export type GetCustomFieldDefinitionsInput = z.input<typeof customFieldSchemas.get>;
export type PatchCustomFieldDefinitionsInput = z.input<typeof customFieldSchemas.patch>;
export type CustomFieldDefinitions = z.output<typeof definitionSchema> & { scope: CustomFieldScope; revision: string };
export type CustomFieldPatchResult = CustomFieldDefinitions & {
  changed: boolean;
  dryRun: boolean;
  writeStatus: "not_attempted" | "saved";
};

type Snapshot = z.output<typeof snapshotSchema>;
type Patch = z.output<typeof customFieldSchemas.patch>;
type Request = { operation: "get"; scope: CustomFieldScope } | ({ operation: "patch"; expected: Snapshot } & Omit<Patch, "revision">);
type Status = WshcmObjectErrorDetails["writeStatus"];

function failure(
  code: string,
  message: string,
  phase: WshcmObjectErrorDetails["phase"],
  writeStatus: Status,
  cause?: unknown,
): WshcmObjectError {
  return new WshcmObjectError({ phase, writeStatus, error: { code, message } }, { cause });
}

function snapshotKey(scope: CustomFieldScope, revision: string) {
  return JSON.stringify([scope.objectType, scope.templateId ?? null, revision]);
}

/** Configured definitions live in one shared native document. Object values use WshcmObjects. */
export class WshcmCustomFieldDefinitions {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly snapshots = new Map<string, Snapshot>();

  constructor(private readonly evaluator: WshcmEvaluator) {}

  private run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work);
    this.tail = next;
    return next;
  }

  private record(scope: CustomFieldScope, snapshot: Snapshot): string {
    const revision = createHash("sha256").update(snapshot.url).update("\0").update(snapshot.xml).digest("hex");
    const key = snapshotKey(scope, revision);
    this.snapshots.delete(key);
    this.snapshots.set(key, snapshot);
    if (this.snapshots.size > 16) this.snapshots.delete(this.snapshots.keys().next().value!);
    return revision;
  }

  private async invoke(request: Request) {
    if (request.operation === "patch") {
      let size = 0;
      for (const op of request.operations) {
        size += Buffer.byteLength(JSON.stringify(op), "utf8") + 1;
        if (size > requestBytes) throw failure("InputLimit", "Custom field patch exceeds the request bound", "input", "not_attempted");
      }
    }
    const json = JSON.stringify(request);
    if (Buffer.byteLength(json, "utf8") > requestBytes)
      throw failure("InputLimit", "Custom field patch exceeds the request bound", "input", "not_attempted");
    const maySave = request.operation === "patch" && !request.dryRun;
    let wire: unknown;
    try {
      wire = await this.evaluator.eval(buildScript(template, { request: json }));
    } catch (cause) {
      const unsent = cause instanceof WshcmDispatchError && !cause.dispatched;
      throw failure("TransportError", "Custom field request failed", "transport", maySave && !unsent ? "unknown" : "not_attempted", cause);
    }

    let result: z.output<typeof carrier>;
    try {
      const maxDecoded = (registryBytes + definitionBytes) * 2;
      if (typeof wire !== "string" || Buffer.byteLength(wire, "utf8") > maxDecoded * 6 + 2) throw new Error("Invalid native carrier");
      const payload: unknown = JSON.parse(wire);
      if (typeof payload !== "string" || !payload.isWellFormed() || Buffer.byteLength(payload, "utf8") > maxDecoded)
        throw new Error("Invalid native envelope");
      result = carrier.parse(JSON.parse(payload));
      if (result.ok) {
        if (
          !result.snapshot.xml.isWellFormed() ||
          Buffer.byteLength(result.snapshot.xml, "utf8") > registryBytes ||
          Buffer.byteLength(JSON.stringify(result.definition), "utf8") > definitionBytes ||
          (!result.definition.exists && (result.definition.fields.length > 0 || result.definition.pages.length > 0))
        )
          throw new Error("Invalid native definition bounds or presence");
        if (request.operation === "get") {
          if (result.changed !== undefined || result.writeStatus !== undefined) throw new Error("Unexpected mutation result");
        } else if (result.changed === undefined || result.writeStatus !== (maySave && result.changed ? "saved" : "not_attempted")) {
          throw new Error("Inconsistent mutation result");
        }
      }
    } catch (cause) {
      throw failure(
        "InvalidResponse",
        "Custom field response could not be verified",
        "readback",
        maySave ? "unknown" : "not_attempted",
        cause,
      );
    }
    if (!result.ok) throw new WshcmObjectError({ phase: result.phase, writeStatus: result.writeStatus, error: result.error });
    return result;
  }

  async get(input: GetCustomFieldDefinitionsInput): Promise<CustomFieldDefinitions> {
    const { scope } = customFieldSchemas.get.parse(input);
    return this.run(async () => {
      const { snapshot, definition } = await this.invoke({ operation: "get", scope });
      return { ...definition, scope, revision: this.record(scope, snapshot) };
    });
  }

  async patch(input: PatchCustomFieldDefinitionsInput): Promise<CustomFieldPatchResult> {
    const { revision, ...args } = customFieldSchemas.patch.parse(input);
    return this.run(async () => {
      const key = snapshotKey(args.scope, revision);
      const expected = this.snapshots.get(key);
      if (!expected) throw failure("ReadRequired", "Read this custom field scope in this SDK instance first", "input", "not_attempted");
      const result = await this.invoke({ ...args, operation: "patch", expected }).catch((error: unknown) => {
        if (error instanceof WshcmObjectError && error.details.writeStatus !== "not_attempted") this.snapshots.delete(key);
        throw error;
      });
      return {
        ...result.definition,
        scope: args.scope,
        revision: this.record(args.scope, result.snapshot),
        changed: result.changed!,
        dryRun: args.dryRun,
        writeStatus: result.writeStatus!,
      };
    });
  }
}
