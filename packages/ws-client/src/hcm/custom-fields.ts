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
// Existing native strings can exceed the editor's input limits. Bound the entire read projection.
const nativeText = z.string().refine(validText);
const objectType = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/);
const scopeSchema = z.strictObject({
  objectType,
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
const advancedFieldText = <T extends z.ZodType<string | null | undefined>>(string: T) => ({
  catalogFilter: string.describe("XQuery qualification used by a foreign_elem selector"),
  validationCondition: string.describe("Native validation expression with oValue"),
  comment: string,
  defaultValueFormula: string.describe("Native default-value formula with GEnv.curUser and GEnv.curObject"),
  width: string,
  height: string,
  visualClass: string,
  maxChars: string.describe("Maximum characters, stored as native text"),
});
const conditionSchema = (string: typeof text) =>
  z.strictObject({
    field: string.optional(),
    topElement: string.optional(),
    title: string.optional(),
    value: string.optional(),
    type: string.optional(),
    operator: string.describe("Native operator code such as eq, neq, gt, lt, gte, lte, cn or ncn").optional(),
    isCustomField: z.boolean().optional(),
    join: string.optional(),
    isMultiple: z.boolean().optional(),
    values: z.array(string).optional(),
    bracket: string.optional(),
  });
const visibilityConditions = z
  .array(
    conditionSchema(text)
      .extend({
        join: z.enum(["and", "or"]).optional(),
        bracket: z.enum(["(", ")"]).optional(),
        values: z.array(text).max(256).optional(),
      })
      .refine(({ field, topElement }) => Boolean(field?.trim() || topElement?.trim()), "A condition needs a field or topElement"),
  )
  .max(256)
  .refine((conditions) => {
    let open = 0;
    for (const row of conditions) {
      if (row.bracket === "(") open++;
      if (row.bracket === ")") open--;
      if (open < 0) return false;
    }
    return open === 0;
  }, "Visibility brackets must be balanced")
  .describe("Replace the ordered native visibility conditions. Use [] to clear them.");
const fieldPatch = fieldProperties
  .extend({
    ...advancedFieldText(text.nullable()),
    visibilityConditions,
  })
  .partial();
const pagePatch = z.strictObject({
  title: text.optional(),
  accessRole: key.nullable().optional().describe("Admin role code. Use null to clear the restriction."),
  accessGroupId: objectIdSchema.nullable().optional().describe("Exact decimal group ID. Use null to clear the restriction."),
});
const moveAnchor = { before: key.optional(), after: key.optional() };
const operationSchema = z
  .discriminatedUnion("op", [
    z.strictObject({ op: z.literal("upsertField"), name: key, set: fieldPatch }),
    z.strictObject({
      op: z.literal("renameField"),
      name: key,
      newName: z
        .string()
        .max(128)
        .regex(/^[A-Za-z][A-Za-z0-9_]*$/),
    }),
    z.strictObject({ op: z.literal("removeField"), name: key }),
    z.strictObject({ op: z.literal("moveField"), name: key, ...moveAnchor }),
    z.strictObject({ op: z.literal("upsertPage"), id: key, set: pagePatch }),
    z.strictObject({ op: z.literal("removePage"), id: key }),
    z.strictObject({ op: z.literal("movePage"), id: key, ...moveAnchor }),
    z.strictObject({ op: z.literal("removeTemplate") }).describe("Remove the configured template selected by scope.templateId."),
  ])
  .superRefine((op, context) => {
    if (op.op === "renameField" && op.name === op.newName) {
      context.addIssue({ code: "custom", path: ["newName"], message: "The new field name must differ from the current name." });
    }
    if (op.op !== "moveField" && op.op !== "movePage") return;
    const target = op.op === "moveField" ? op.name : op.id;
    if ((op.before === undefined) === (op.after === undefined) || (op.before ?? op.after) === target) {
      context.addIssue({ code: "custom", message: "A move needs exactly one before or after key different from the moved key." });
    }
  });

const getInput = z.strictObject({
  scope: scopeSchema.describe("For full definitions, pass the common object type or the template owner type and exact templateId."),
});
const listOffset = z.number().int().nonnegative();
const listLimit = z.number().int().min(1).max(100);
const listInput = z.strictObject({
  objectType: objectType.describe("Document type or template owner type to look up in the shared custom field registry"),
  offset: listOffset.optional().describe("Number of registered templates to skip, default 0"),
  limit: listLimit.optional().describe("Maximum templates on this page, default 50"),
});
const listMode = z.literal("list").describe("Use list to discover templates. For a full read, pass scope.");

export const customFieldSchemas = {
  get: getInput,
  lookup: z
    .strictObject({ ...listInput.partial().shape, mode: listMode.optional(), scope: getInput.shape.scope.optional() })
    .pipe(z.union([getInput, listInput.extend({ mode: listMode })])),
  list: listInput,
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
        ...advancedFieldText(nativeText.optional()),
        visibilityConditions: z.array(conditionSchema(nativeText)).optional(),
      }),
    )
    .max(1000),
  pages: z
    .array(
      z.strictObject({
        id: nativeText,
        title: nativeText,
        accessRole: nativeText.optional(),
        // Keep imported integer values readable so an administrator can clear them.
        accessGroupId: z
          .string()
          .regex(/^-?\d{1,20}$/)
          .optional(),
      }),
    )
    .max(1000),
  fieldTypes: z.array(z.strictObject({ id: nativeText, title: nativeText })).max(128),
});
const phase = z.enum(["input", "read", "validate", "save", "readback"]);
const writeStatus = z.enum(["not_attempted", "unknown", "saved"]);
const definitionResponse = z.strictObject({
  ok: z.literal(true),
  snapshot: snapshotSchema,
  definition: definitionSchema,
  changed: z.boolean().optional(),
  writeStatus: z.enum(["not_attempted", "saved"]).optional(),
});
const counts = z.strictObject({ fieldCount: z.number().int().nonnegative(), pageCount: z.number().int().nonnegative() });
const listingSchema = z.strictObject({
  objectType,
  common: counts.nullable(),
  templateType: objectType.nullable(),
  templateSelector: nativeText.min(1).max(512).nullable(),
  offset: listOffset,
  limit: listLimit,
  total: z.number().int().nonnegative(),
  templates: z.array(counts.extend({ templateId: objectIdSchema, title: nativeText.max(512).optional() })).max(100),
});
const listResponse = z.strictObject({ ok: z.literal(true), listing: listingSchema });
const errorResponse = z.strictObject({
  ok: z.literal(false),
  phase,
  writeStatus,
  error: z.strictObject({ code: z.string().min(1).max(80), message: z.string().max(2000) }),
});

export type CustomFieldScope = z.output<typeof scopeSchema>;
export type GetCustomFieldDefinitionsInput = z.input<typeof getInput>;
export type ListCustomFieldTemplatesInput = z.input<typeof listInput>;
export type CustomFieldTemplateList = z.output<typeof listingSchema>;
export type PatchCustomFieldDefinitionsInput = z.input<typeof customFieldSchemas.patch>;
export type CustomFieldDefinitions = z.output<typeof definitionSchema> & { scope: CustomFieldScope; revision: string };
export type CustomFieldPatchResult = CustomFieldDefinitions & {
  changed: boolean;
  dryRun: boolean;
  writeStatus: "not_attempted" | "saved";
};

type Snapshot = z.output<typeof snapshotSchema>;
type Patch = z.output<typeof customFieldSchemas.patch>;
type DefinitionRequest =
  { operation: "get"; scope: CustomFieldScope } | ({ operation: "patch"; expected: Snapshot } & Omit<Patch, "revision">);
type ListRequest = { operation: "list"; objectType: string; offset: number; limit: number };
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

  private async invoke<T>(request: DefinitionRequest | ListRequest, parse: (value: unknown) => T): Promise<T> {
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

    try {
      const maxDecoded = request.operation === "list" ? definitionBytes : (registryBytes + definitionBytes) * 2;
      if (typeof wire !== "string" || Buffer.byteLength(wire, "utf8") > maxDecoded * 6 + 2) throw new Error("Invalid native carrier");
      const payload: unknown = JSON.parse(wire);
      if (typeof payload !== "string" || !payload.isWellFormed() || Buffer.byteLength(payload, "utf8") > maxDecoded)
        throw new Error("Invalid native envelope");
      const value: unknown = JSON.parse(payload);
      const failed = errorResponse.safeParse(value);
      if (failed.success)
        throw new WshcmObjectError({ phase: failed.data.phase, writeStatus: failed.data.writeStatus, error: failed.data.error });
      return parse(value);
    } catch (cause) {
      if (cause instanceof WshcmObjectError) throw cause;
      throw failure(
        "InvalidResponse",
        "Custom field response could not be verified",
        "readback",
        maySave ? "unknown" : "not_attempted",
        cause,
      );
    }
  }

  private invokeDefinition(request: DefinitionRequest) {
    return this.invoke(request, (value) => {
      const result = definitionResponse.parse(value);
      if (
        !result.snapshot.xml.isWellFormed() ||
        Buffer.byteLength(result.snapshot.xml, "utf8") > registryBytes ||
        Buffer.byteLength(JSON.stringify(result.definition), "utf8") > definitionBytes ||
        (!result.definition.exists && (result.definition.fields.length > 0 || result.definition.pages.length > 0))
      )
        throw new Error("Invalid native definition bounds or presence");
      if (request.operation === "get") {
        if (result.changed !== undefined || result.writeStatus !== undefined) throw new Error("Unexpected mutation result");
      } else if (result.changed === undefined || result.writeStatus !== (!request.dryRun && result.changed ? "saved" : "not_attempted")) {
        throw new Error("Inconsistent mutation result");
      }
      return result;
    });
  }

  async list(input: ListCustomFieldTemplatesInput): Promise<CustomFieldTemplateList> {
    const { objectType, offset = 0, limit = 50 } = listInput.parse(input);
    return this.run(() =>
      this.invoke({ operation: "list", objectType, offset, limit }, (value) => {
        const { listing } = listResponse.parse(value);
        const expectedSize = Math.min(limit, Math.max(0, listing.total - offset));
        if (
          listing.objectType !== objectType ||
          listing.offset !== offset ||
          listing.limit !== limit ||
          listing.templates.length !== expectedSize ||
          (listing.templateType === null && (listing.total !== 0 || listing.templateSelector !== null))
        )
          throw new Error("Inconsistent custom field template page");
        return listing;
      }),
    );
  }

  async get(input: GetCustomFieldDefinitionsInput): Promise<CustomFieldDefinitions> {
    const { scope } = getInput.parse(input);
    return this.run(async () => {
      const { snapshot, definition } = await this.invokeDefinition({ operation: "get", scope });
      return { ...definition, scope, revision: this.record(scope, snapshot) };
    });
  }

  async patch(input: PatchCustomFieldDefinitionsInput): Promise<CustomFieldPatchResult> {
    const { revision, ...args } = customFieldSchemas.patch.parse(input);
    return this.run(async () => {
      const key = snapshotKey(args.scope, revision);
      const expected = this.snapshots.get(key);
      if (!expected) throw failure("ReadRequired", "Read this custom field scope in this SDK instance first", "input", "not_attempted");
      const result = await this.invokeDefinition({ ...args, operation: "patch", expected }).catch((error: unknown) => {
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
