import { packageSchemas } from "./packages/schemas.js";
import { z } from "zod";
import { fileUrl, fileText } from "./file-contract.js";
import { searchInput } from "./search-contract.js";
import { objectXmlBytes } from "./object-xml.js";
import { objectIdSchema as objectId } from "./object-id.js";
import { objectDataTypesInputSchema, objectTypesInputSchema } from "./object-types.js";
import { runAgentInputSchema } from "./run-agent.js";
import { customFieldSchemas } from "./custom-fields.js";

const read = z
  .strictObject({
    path: fileUrl,
    startLine: z.number().int().min(1).max(1048577).optional(),
    endLine: z.number().int().min(1).max(1048577).optional(),
    readToken: z.string().min(1).max(128).optional(),
  })
  .refine((input) => input.endLine === undefined || input.endLine >= (input.startLine ?? 1));
const write = z
  .strictObject({
    path: fileUrl,
    content: fileText.describe("Exact text to write; UTF-8 BOM is added"),
    mode: z.enum(["create", "overwrite"]).default("create"),
    readToken: z.string().min(1).max(128).optional(),
  })
  .refine((input) => (input.mode === "overwrite" ? input.readToken !== undefined : input.readToken === undefined));
const edit = z.strictObject({
  path: fileUrl,
  readToken: z.string().min(1).max(128),
  edits: z.array(z.strictObject({ oldText: fileText.refine((text) => text.length > 0), newText: fileText })).max(100),
  dryRun: z.boolean().optional().default(false),
  expectedSha256: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional()
    .describe("Optional extra check against the read token's byte hash; never replaces readToken"),
});
const list = z.strictObject({ path: fileUrl });
const deleteInput = z.strictObject({ path: fileUrl });
const mkdir = z.strictObject({ path: fileUrl });
const move = z.strictObject({ source: fileUrl, destination: fileUrl });
const info = z.strictObject({ path: fileUrl });
const formUrl = z
  .string()
  .max(2048)
  .regex(/^x-(?:local|app):\/\/[A-Za-z0-9._~!$&()+,@%/-]+\.xmd$/)
  .describe("Full local platform XMD URL; no open options or alternate database");
const boundedXml = z
  .string()
  .max(objectXmlBytes)
  .refine((xml) => xml.isWellFormed() && Buffer.byteLength(xml, "utf8") <= objectXmlBytes);
const patchInput = z.strictObject({ id: objectId, readToken: z.uuid(), xml: boundedXml, dryRun: z.boolean().default(false) });
const saveInput = z
  .strictObject({
    mode: z.enum(["create", "replace"]),
    formUrl: formUrl.optional(),
    id: objectId.optional(),
    readToken: z.uuid().optional(),
    xml: boundedXml.describe("Full object XML; omitted fields are removed on replace"),
  })
  .superRefine((input, context) => {
    if (
      input.mode === "create"
        ? input.formUrl === undefined || input.id !== undefined || input.readToken !== undefined
        : input.id === undefined || input.readToken === undefined || input.formUrl !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "create requires formUrl and forbids id/readToken; replace requires id/readToken and forbids formUrl",
      });
    }
  });
const xquery = z.strictObject({
  query: z
    .string()
    .max(65536)
    .refine(
      (query) => query.trim().length > 0 && query.isWellFormed() && !query.includes("\0") && Buffer.byteLength(query, "utf8") <= 65536,
    )
    .describe("Query passed unchanged to server-side XQuery; the sql: prefix is supported. No read-only validation."),
  maxRows: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe("Returned row limit, not a database workload limit; reads up to one extra row."),
});

/** Shared SDK and MCP input contracts; defaults are applied by every SDK operation. */
export const wshcmSchemas = {
  packages: packageSchemas,
  customFields: customFieldSchemas,
  files: { read, write, edit, list, delete: deleteInput, mkdir, move, info, search: searchInput },
  objects: {
    listTypes: objectTypesInputSchema,
    listDataTypes: objectDataTypesInputSchema,
    getForm: z.strictObject({ formUrl }),
    get: z.strictObject({ id: objectId }),
    save: saveInput,
    patch: patchInput,
    delete: z.strictObject({ id: objectId, readToken: z.uuid() }),
  },
  xquery,
  runAgent: runAgentInputSchema,
  execute: z.strictObject({
    code: z
      .string()
      .max(65536)
      .refine(
        (code) =>
          code.trim().length > 0 &&
          code.isWellFormed() &&
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(code) &&
          Buffer.byteLength(code, "utf8") <= 65536,
      )
      .describe(
        "Server BorisScript; use return for the result and experimental print(value) for call-local diagnostics; its usefulness is under evaluation. May modify data; no cancellation or rollback guarantee.",
      ),
  }),
  systemInfo: z.strictObject({
    includeReport: z
      .boolean()
      .default(false)
      .describe("Include the complete native system information report, without additional redaction. Defaults to summary only."),
  }),
  runtimeStatus: z.strictObject({}),
} as const;
