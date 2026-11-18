import { WshcmDispatchError } from "../exceptions.js";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { WshcmEvaluator } from "./types.js";
import { buildScript } from "./load.js";
import { inspectObjectPatchXml, inspectObjectXml, objectRequestBytes, objectXmlBytes } from "./object-xml.js";
import { ObjectReadState } from "./object-state.js";
import { wshcmSchemas } from "./schemas.js";
import { WshcmObjectError } from "./object-error.js";
const template = readFileSync(new URL("../../resources/object-operation.bs", import.meta.url), "utf8");
const patchHelper = readFileSync(new URL("../../resources/object-patch.bs", import.meta.url), "utf8");
const { id: objectId } = wshcmSchemas.objects.get.shape;
const { formUrl } = wshcmSchemas.objects.getForm.shape;
const boundedXml = z
  .string()
  .max(objectXmlBytes)
  .refine((xml) => xml.isWellFormed() && Buffer.byteLength(xml, "utf8") <= objectXmlBytes);
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
const patchResponse = saveResponse.extend({ changed: z.boolean(), dryRun: z.boolean(), writeStatus: z.enum(["saved", "not_attempted"]) });
const patchAck = patchResponse.pick({ ok: true, id: true, writeStatus: true }).strip();
const failure = z.strictObject({
  ok: z.literal(false),
  id: z.string().max(20),
  phase: z.enum(["read", "validate", "load", "bind", "save", "readback"]),
  writeStatus: z.enum(["not_attempted", "unknown", "saved"]),
  // The carrier/envelope bounds diagnostics; truncate after parsing so a long
  // message cannot discard a valid identity/phase/save acknowledgement.
  error: z.strictObject({ code: z.string().max(100), message: z.string() }),
});

/** Call the native operation once, checking both string carriers before parsing its envelope. */
async function execute(evaluator: WshcmEvaluator, request: Record<string, unknown>): Promise<unknown> {
  const json = JSON.stringify(request);
  if (Buffer.byteLength(json, "utf8") > objectRequestBytes)
    throw new Error("InputLimit: XML and validation metadata exceed the 2 MiB request budget");
  const operation = request.operation === "patch_object" ? patchHelper + "\n" + template : template;
  const wire: unknown = await evaluator.eval(buildScript(operation, { request: json }));
  if (typeof wire !== "string" || Buffer.byteLength(wire, "utf8") > 4 * 1048576 * 6 + 2)
    throw new Error("Invalid platform object response carrier");
  const text: unknown = JSON.parse(wire);
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 4 * 1048576) throw new Error("Invalid platform object response size");
  const result: unknown = JSON.parse(text);
  if (request.operation === "patch_object") {
    if (typeof result !== "object" || result === null || !("id" in result) || result.id !== request.id)
      throw new Error("Object patch response identity mismatch");
    if (request.dryRun && (!("writeStatus" in result) || result.writeStatus !== "not_attempted"))
      throw new Error("Inconsistent object patch preview response");
  }
  const failed = failure.safeParse(result);
  if (failed.success)
    throw new WshcmObjectError({ ...failed.data, error: { ...failed.data.error, message: failed.data.error.message.slice(0, 2000) } });
  return result;
}

type Input<K extends keyof typeof wshcmSchemas.objects> = z.input<(typeof wshcmSchemas.objects)[K]>;

/** Native XML operations; no evaluator initialization, disposal or managed file dependency. */
export class WshcmObjects {
  private readonly reads = new ObjectReadState();
  constructor(private readonly evaluator: WshcmEvaluator) {}

  async getForm(input: Input<"getForm">) {
    const { formUrl } = wshcmSchemas.objects.getForm.parse(input);
    return this.reads.run(async () => {
      try {
        const result = await execute(this.evaluator, { operation: "get_form", formUrl });
        const { ok: _, ...body } = formResponse.parse(result);
        return body;
      } catch (error) {
        if (error instanceof WshcmObjectError) throw error;
        throw new WshcmObjectError(
          {
            error: { code: "ReadError", message: String(error).slice(0, 2000) },
            phase: "read",
            writeStatus: "not_attempted",
          },
          { cause: error },
        );
      }
    });
  }

  async get(input: Input<"get">) {
    const { id } = wshcmSchemas.objects.get.parse(input);
    return this.reads.run(async () => {
      try {
        const result = await execute(this.evaluator, { operation: "get_object", id });
        const { ok: _, schemaXml, ...body } = readResponse.parse(result);
        if (body.id !== id) throw new Error("Object response identity mismatch");
        return { ...body, readToken: this.reads.record({ ...body, schemaXml }) };
      } catch (error) {
        if (error instanceof WshcmObjectError) throw error;
        throw new WshcmObjectError(
          {
            error: { code: "ReadError", message: String(error).slice(0, 2000) },
            id,
            phase: "read",
            writeStatus: "not_attempted",
          },
          { cause: error },
        );
      }
    });
  }

  async patch(input: Input<"patch">) {
    return this.reads.run(async () => {
      let phase: "input" | "transport" | "readback" = "input";
      let writeStatus: "not_attempted" | "unknown" | "saved" = "not_attempted";
      let knownId: string | undefined;
      try {
        knownId = objectId.parse(input?.id);
        const token = wshcmSchemas.objects.patch.shape.readToken.parse(input?.readToken);
        const expected = this.reads.consume(knownId, token);
        const args = wshcmSchemas.objects.patch.parse(input);
        const inspected = inspectObjectPatchXml(args.xml, expected);
        const request = {
          operation: "patch_object",
          mode: "patch",
          id: args.id,
          formUrl: expected.formUrl,
          xml: args.xml,
          root: inspected.root,
          nodes: inspected.nodes,
          dryRun: args.dryRun,
          expected: { xml: expected.xml, formUrl: expected.formUrl, schemaXml: expected.schemaXml },
        };
        if (Buffer.byteLength(JSON.stringify(request), "utf8") > objectRequestBytes)
          throw new Error("InputLimit: XML and validation metadata exceed 2 MiB");
        phase = "transport";
        writeStatus = args.dryRun ? "not_attempted" : "unknown";
        const result = await execute(this.evaluator, request);
        const ack = patchAck.safeParse(result);
        if (ack.success) {
          phase = "readback";
          writeStatus = ack.data.writeStatus;
        }
        const { ok: _, ...body } = patchResponse.parse(result);
        if (
          body.formUrl !== expected.formUrl ||
          body.root !== inspected.root ||
          body.dryRun !== args.dryRun ||
          (body.writeStatus === "saved") !== (body.changed && !args.dryRun)
        )
          throw new Error("Inconsistent object patch response");
        return body;
      } catch (error) {
        if (error instanceof WshcmObjectError) throw error;
        throw new WshcmObjectError(
          {
            error: { code: phase === "input" ? "InvalidInput" : "TransportError", message: String(error).slice(0, 2000) },
            ...(knownId ? { id: knownId } : {}),
            phase,
            writeStatus: phase === "transport" && error instanceof WshcmDispatchError && !error.dispatched ? "not_attempted" : writeStatus,
          },
          { cause: error },
        );
      }
    });
  }

  async save(input: Input<"save">) {
    const args = wshcmSchemas.objects.save.parse(input);
    return this.reads.run(async () => {
      let phase: "input" | "transport" | "readback" = "input";
      let writeStatus: "not_attempted" | "unknown" | "saved" = "not_attempted";
      let knownId = args.id;
      try {
        const expected = args.mode === "replace" ? this.reads.consume(args.id!, args.readToken!) : undefined;
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
        if (Buffer.byteLength(JSON.stringify(request), "utf8") > objectRequestBytes)
          throw new Error("InputLimit: XML and validation metadata exceed 2 MiB");
        phase = "transport";
        writeStatus = "unknown";
        const result = await execute(this.evaluator, request);
        const acknowledgement = z.object({ ok: z.literal(true), id: objectId, writeStatus: z.literal("saved") }).safeParse(result);
        if (acknowledgement.success) {
          knownId = acknowledgement.data.id;
          writeStatus = "saved";
          phase = "readback";
        }
        const { ok: _, ...body } = saveResponse.parse(result);
        if (args.mode === "replace" && body.id !== args.id) throw new Error("Saved object response identity mismatch");
        return body;
      } catch (error) {
        if (error instanceof WshcmObjectError) throw error;
        throw new WshcmObjectError(
          {
            error: { code: phase === "input" ? "InvalidInput" : "TransportError", message: String(error).slice(0, 2000) },
            ...(knownId ? { id: knownId } : {}),
            phase,
            writeStatus: phase === "transport" && error instanceof WshcmDispatchError && !error.dispatched ? "not_attempted" : writeStatus,
          },
          { cause: error },
        );
      }
    });
  }
}
