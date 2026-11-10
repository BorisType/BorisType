import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";
import { inspectObjectXml, objectXmlBytes } from "./object-xml.js";
import { ObjectReadState } from "./object-state.js";

const template = readFileSync(new URL("../../resources/object-operation.bs", import.meta.url), "utf8");
const formUrl = z
  .string()
  .max(2048)
  .regex(/^x-(?:local|app):\/\/[A-Za-z0-9._~!$&()+,@%/-]+\.xmd$/)
  .describe("Full local platform XMD URL; no open options or alternate database");
const objectId = z
  .string()
  .regex(/^[1-9]\d{0,19}$/)
  .refine((id) => /^[1-9]\d{0,19}$/.test(id) && BigInt(id) <= 18446744073709551615n)
  .describe("Exact positive decimal object ID as a string, never a JSON number");
const boundedXml = z
  .string()
  .max(objectXmlBytes)
  .refine((xml) => xml.isWellFormed() && Buffer.byteLength(xml, "utf8") <= objectXmlBytes);
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
const readResponse = z.strictObject({
  ok: z.literal(true),
  id: objectId,
  formUrl,
  root: z.string().min(1).max(256),
  xml: boundedXml,
  schemaXml: boundedXml,
});
const formResponse = z.strictObject({ ok: z.literal(true), formUrl, root: z.string().min(1).max(256), xml: boundedXml });
const saveResponse = z.strictObject({
  ok: z.literal(true),
  id: objectId,
  formUrl,
  root: z.string().min(1).max(256),
  xml: boundedXml,
  writeStatus: z.literal("saved"),
});
const failure = z.strictObject({
  ok: z.literal(false),
  id: z.string().max(20),
  phase: z.enum(["read", "validate", "load", "bind", "save", "readback"]),
  writeStatus: z.enum(["not_attempted", "unknown", "saved"]),
  // The carrier/envelope bounds diagnostics; truncate after parsing so a long
  // message cannot discard a valid identity/phase/save acknowledgement.
  error: z.strictObject({ code: z.string().max(100), message: z.string() }),
});

/** Return a bounded JSON result; XML is a string, never an object mapping. */
function output(body: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(body) }], ...(isError ? { isError: true } : {}) };
}

/** Call the native operation once, checking both string carriers before parsing its envelope. */
async function execute(connection: WshcmConnection, request: Record<string, unknown>): Promise<unknown> {
  const json = JSON.stringify(request);
  if (Buffer.byteLength(json, "utf8") > 2097152) throw new Error("InputLimit: XML and validation metadata exceed the 2 MiB request budget");
  const wire: unknown = await connection.evaluator.eval(buildScript(template, { request: json }));
  if (typeof wire !== "string" || Buffer.byteLength(wire, "utf8") > 4 * 1048576 * 6 + 2)
    throw new Error("Invalid platform object response carrier");
  const text: unknown = JSON.parse(wire);
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 4 * 1048576) throw new Error("Invalid platform object response size");
  const result: unknown = JSON.parse(text);
  const failed = failure.safeParse(result);
  if (failed.success) return { ...failed.data, error: { ...failed.data.error, message: failed.data.error.message.slice(0, 2000) } };
  return result;
}

/** Register the XML-only form/read/create/replace MVP without requiring a .NET DLL. */
export function registerObjectTools(server: McpServer, connection: WshcmConnection): void {
  const reads = new ObjectReadState();
  const readAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  const description =
    " Uses platform XML API without a DLL. Form loading and initialization may execute code; this is not UI business validation or a storage backup.";
  server.registerTool(
    "wshcm_get_form",
    {
      description:
        "Get the loaded, expanded XMD root as XML, with root and actual form URL. Inheritance is resolved by the platform; remaining dependencies/cache freshness are not guaranteed." +
        description,
      inputSchema: z.strictObject({ formUrl }),
      annotations: readAnnotations,
    },
    ({ formUrl }) =>
      reads.run(async () => {
        try {
          const result = await execute(connection, { operation: "get_form", formUrl });
          if (failure.safeParse(result).success) return output(result, true);
          const { ok: _, ...body } = formResponse.parse(result);
          return output(body);
        } catch (error) {
          return output(
            { error: { code: "ReadError", message: String(error).slice(0, 2000) }, phase: "read", writeStatus: "not_attempted" },
            true,
          );
        }
      }),
  );
  server.registerTool(
    "wshcm_get_object",
    {
      description:
        "Read a full object XML by exact decimal ID, its actual form URL and a readToken for whole-document replace. Oversized XML is rejected, not truncated. Tokens belong to this MCP instance and expire after 30 minutes." +
        description,
      inputSchema: z.strictObject({ id: objectId }),
      annotations: readAnnotations,
    },
    ({ id }) =>
      reads.run(async () => {
        try {
          const result = await execute(connection, { operation: "get_object", id });
          if (failure.safeParse(result).success) return output(result, true);
          const { ok: _, schemaXml, ...body } = readResponse.parse(result);
          if (body.id !== id) throw new Error("Object response identity mismatch");
          return output({ ...body, readToken: reads.record({ ...body, schemaXml }) });
        } catch (error) {
          return output(
            { error: { code: "ReadError", message: String(error).slice(0, 2000) }, id, phase: "read", writeStatus: "not_attempted" },
            true,
          );
        }
      }),
  );
  server.registerTool(
    "wshcm_save_object",
    {
      description:
        "Create or fully replace ONE object using XML. Create requires formUrl and no ID; replace requires id/readToken from a full read and uses the object's actual form. Omitted fields are removed on replace. Checks syntax, root, identity, known paths, singleton cardinality and integer lexical/range. Other types use native conversion; no full business validation. A replace attempt consumes the token. Compare-before-save is not atomic CAS. Save/hooks can partially succeed; inspect writeStatus and known ID, never blindly retry." +
        description,
      inputSchema: saveInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    (args) =>
      reads.run(async () => {
        let phase = "input";
        let writeStatus = "not_attempted";
        let knownId = args.id;
        try {
          const expected = args.mode === "replace" ? reads.consume(args.id!, args.readToken!) : undefined;
          const selectedForm = expected?.formUrl ?? args.formUrl!;
          const inspected = inspectObjectXml(args.xml, { formUrl: selectedForm, ...(args.id === undefined ? {} : { id: args.id }) });
          const request = {
            operation: "save_object",
            mode: args.mode,
            formUrl: selectedForm,
            id: args.id ?? "",
            xml: args.xml,
            root: inspected.root,
            nodes: inspected.nodes,
            ...(expected ? { expected: { xml: expected.xml, formUrl: expected.formUrl, schemaXml: expected.schemaXml } } : {}),
          };
          // Budget rejection happens before entering the uncertain transport phase.
          if (Buffer.byteLength(JSON.stringify(request), "utf8") > 2097152)
            throw new Error("InputLimit: XML and validation metadata exceed 2 MiB");
          phase = "transport";
          writeStatus = "unknown";
          const result = await execute(connection, request);
          if (failure.safeParse(result).success) return output(result, true);
          const acknowledgement = z.object({ ok: z.literal(true), id: objectId, writeStatus: z.literal("saved") }).safeParse(result);
          if (acknowledgement.success) {
            knownId = acknowledgement.data.id;
            writeStatus = "saved";
            phase = "readback";
          }
          const { ok: _, ...body } = saveResponse.parse(result);
          if (args.mode === "replace" && body.id !== args.id) throw new Error("Saved object response identity mismatch");
          return output(body);
        } catch (error) {
          return output(
            {
              error: { code: phase === "input" ? "InvalidInput" : "TransportError", message: String(error).slice(0, 2000) },
              ...(knownId ? { id: knownId } : {}),
              phase,
              writeStatus,
            },
            true,
          );
        }
      }),
  );
}
