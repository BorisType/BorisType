import { readFileSync } from "node:fs";
import { z } from "zod";
import { buildScript } from "./load.js";
import { WshcmObjectError } from "./object-error.js";
import { objectIdSchema } from "./object-id.js";
import type { WshcmEvaluator } from "./types.js";

const template = readFileSync(new URL("../../resources/object-types.bs", import.meta.url), "utf8");
const pageBytes = 256 * 1024;
const kind = z.enum(["object", "catalog"]);
const offset = z.number().int().nonnegative();
const limit = z.number().int().min(1).max(250);

export const objectTypesInputSchema = z
  .strictObject({
    offset: offset.default(0).describe("Number of matching entries to skip"),
    limit: limit.default(100).describe("Maximum entries in the page"),
    kind: kind.optional().describe("Filter by exact registry entry kind"),
    objectType: z.string().min(1).max(256).optional().describe("Exact document type. Matches that type and its registered catalogs."),
    includeCustomFields: z
      .boolean()
      .optional()
      .describe("Include configured field definitions and their template IDs for one exact document type."),
  })
  .refine((input) => !input.includeCustomFields || (input.objectType !== undefined && input.kind !== "catalog"), {
    path: ["includeCustomFields"],
    error: "Field definitions require objectType and a result that includes object entries",
  });

const customField = z.strictObject({
  name: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1).optional(),
  required: z.boolean(),
  catalog: z.string().min(1).optional(),
});
const customFields = z.strictObject({
  typeFieldCount: z.number().int().nonnegative(),
  templatesWithFields: z.number().int().nonnegative().max(4096),
  templateType: z.string().min(1).optional(),
  templateSelector: z.string().min(1).optional(),
  fields: z.array(customField).max(2048).optional(),
  templates: z
    .array(z.strictObject({ id: objectIdSchema, fields: z.array(customField).min(1).max(2048) }))
    .max(2048)
    .optional(),
});

const response = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    total: z.number().int().min(0).max(8192),
    offset,
    limit,
    items: z
      .array(
        z.strictObject({
          kind,
          name: z.string().min(1),
          isCustom: z.boolean(),
          title: z.string().min(1).optional(),
          formUrl: z.string().min(1).optional(),
          isHier: z.boolean().optional(),
          supportsCustomFields: z.boolean().optional(),
          objectType: z.string().min(1).nullable().optional(),
          customFields: customFields.optional(),
        }),
      )
      .max(250),
    sources: z.strictObject({
      exchangeObjectTypes: z.enum(["available", "not_requested"]),
      registeredCatalogs: z.enum(["available", "unavailable", "not_requested"]),
    }),
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({ code: z.enum(["RegistryError", "OutputLimit"]), message: z.string() }),
  }),
]);

export type ObjectTypesInput = z.input<typeof objectTypesInputSchema>;
export type ObjectTypesResult = Omit<Extract<z.output<typeof response>, { ok: true }>, "ok">;

function readError(code: string, message: string, cause?: unknown): WshcmObjectError {
  return new WshcmObjectError({ phase: "read", writeStatus: "not_attempted", error: { code, message: message.slice(0, 2000) } }, { cause });
}

/** Read a page from the HCM registries with their identities and coverage intact. */
export async function listObjectTypes(evaluator: WshcmEvaluator, input: ObjectTypesInput): Promise<ObjectTypesResult> {
  const request = objectTypesInputSchema.parse(input);
  // The evaluator also classifies transport failures. Preserve its error as-is.
  const wire = await evaluator.eval(
    buildScript(template, {
      request: JSON.stringify({
        ...request,
        kind: request.kind ?? "",
        objectType: request.objectType ?? "",
        includeCustomFields: request.includeCustomFields ?? false,
      }),
    }),
  );
  let parsed: z.output<typeof response>;
  try {
    if (typeof wire !== "string" || Buffer.byteLength(wire, "utf8") > pageBytes * 6 + 2)
      throw new Error("Invalid object type response carrier");
    const json: unknown = JSON.parse(wire);
    if (typeof json !== "string" || !json.isWellFormed() || Buffer.byteLength(json, "utf8") > pageBytes)
      throw new Error("Invalid object type response size or encoding");
    parsed = response.parse(JSON.parse(json));
  } catch (error) {
    throw readError("InvalidResponse", "The object type registry response could not be decoded", error);
  }
  if (!parsed.ok) throw readError(parsed.error.code, parsed.error.message);
  const { ok: _, ...result } = parsed;
  const expectedSize = Math.min(request.limit, Math.max(0, result.total - request.offset));
  if (
    result.offset !== request.offset ||
    result.limit !== request.limit ||
    result.items.length !== expectedSize ||
    (result.sources.exchangeObjectTypes === "not_requested") !== (request.kind === "catalog") ||
    (result.sources.registeredCatalogs === "not_requested") !== (request.kind === "object") ||
    result.items.some((item) => {
      const isObject = item.kind === "object";
      return (
        (isObject ? result.sources.exchangeObjectTypes !== "available" : result.sources.registeredCatalogs !== "available") ||
        (request.objectType !== undefined && (isObject ? item.name : item.objectType) !== request.objectType)
      );
    })
  )
    throw readError("InvalidResponse", "The object type registry returned an inconsistent page");
  return result;
}
