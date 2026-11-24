import { WshcmDispatchError } from "../exceptions.js";
import { readFileSync } from "node:fs";
import { TransferFiles, type TransferFile, type TransferLocation } from "./transfer-files.js";
import { LocalFileError } from "./local-file-access.js";
import { z } from "zod";
import type { WshcmEvaluator } from "./types.js";
import { buildScript } from "./load.js";
import { inspectObjectPatchXml, inspectObjectXml, objectRequestBytes, objectXmlBytes } from "./object-xml.js";
import { ObjectReadState } from "./object-state.js";
import { wshcmSchemas } from "./schemas.js";
import { WshcmObjectDeleteError, WshcmObjectError } from "./object-error.js";
import { listObjectDataTypes, listObjectTypes, type ObjectDataTypesResult, type ObjectTypesResult } from "./object-types.js";
const template = readFileSync(new URL("../../resources/object-operation.bs", import.meta.url), "utf8");
const patchHelper = readFileSync(new URL("../../resources/object-patch.bs", import.meta.url), "utf8");
const deleteTemplate = readFileSync(new URL("../../resources/object-delete.bs", import.meta.url), "utf8");
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
const deleteResponse = z.strictObject({ ok: z.literal(true), id: objectId, mode: z.literal("trash"), deleteStatus: z.literal("deleted") });
const deleteFailure = z.strictObject({
  ok: z.literal(false),
  id: objectId,
  phase: z.enum(["read", "validate", "delete"]),
  deleteStatus: z.enum(["not_attempted", "unknown"]),
  error: z.strictObject({ code: z.string().max(100), message: z.string() }),
});

function encodeRequest(request: Record<string, unknown>): string {
  const json = JSON.stringify(request);
  if (Buffer.byteLength(json, "utf8") > objectRequestBytes)
    throw new Error("InputLimit: XML and validation metadata exceed the 2 MiB request budget");
  return json;
}

/** Check both string carriers before parsing the native envelope. */
function decodeObjectResponse(wire: unknown): unknown {
  if (typeof wire !== "string" || Buffer.byteLength(wire, "utf8") > 4 * 1048576 * 6 + 2)
    throw new Error("Invalid platform object response carrier");
  const text: unknown = JSON.parse(wire);
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 4 * 1048576) throw new Error("Invalid platform object response size");
  return JSON.parse(text) as unknown;
}

async function execute(evaluator: WshcmEvaluator, request: Record<string, unknown>): Promise<unknown> {
  const operation = request.operation === "patch_object" ? patchHelper + "\n" + template : template;
  const wire = await evaluator.eval(buildScript(operation, { request: encodeRequest(request) }));
  const result = decodeObjectResponse(wire);
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

type XmlOptions = { outputMode?: "inline" | "file"; inputPath?: string; outputPath?: string };
type InlineXml = { xml: string };
type FileXml = { file: TransferFile };
type XmlOutput<I> = I extends { outputMode: "inline" }
  ? InlineXml
  : I extends { outputMode: "file" } | { outputPath: string } | { inputPath: string; outputMode?: "file" }
    ? FileXml
    : I extends { outputMode?: "inline"; outputPath?: undefined; inputPath?: undefined }
      ? InlineXml
      : Extract<keyof I, keyof XmlOptions> extends never
        ? InlineXml
        : InlineXml | FileXml;

/** Native XML operations; no evaluator initialization, disposal or managed file dependency. */
export class WshcmObjects {
  private readonly reads = new ObjectReadState();
  constructor(
    private readonly evaluator: WshcmEvaluator,
    private readonly files = new TransferFiles(),
  ) {}

  private destination(input: XmlOptions) {
    if (input.outputMode === "file" || input.outputPath !== undefined || (input.inputPath !== undefined && input.outputMode !== "inline"))
      return this.files.destination("objects", input.outputPath);
    return undefined;
  }

  private async output<I, B extends InlineXml>(_input: I, body: B, destination?: TransferLocation) {
    const { xml, ...metadata } = body;
    let content: InlineXml | FileXml = { xml };
    if (destination) {
      try {
        content = { file: await this.files.publish(destination, { xml }) };
      } catch (cause) {
        throw new LocalFileError("ExportWriteError", "Could not publish XML: " + String(cause), { cause });
      }
    }
    return { ...metadata, ...(content as XmlOutput<I>) };
  }

  async getForm<I extends Input<"getForm">>(input: I) {
    const args = wshcmSchemas.objects.getForm.parse(input);
    const { formUrl } = args;
    return this.reads.run(async () => {
      try {
        const destination = await this.destination(args);
        const result = await execute(this.evaluator, { operation: "get_form", formUrl });
        const { ok: _, ...body } = formResponse.parse(result);
        return await this.output(input, body, destination);
      } catch (error) {
        if (error instanceof WshcmObjectError) throw error;
        throw new WshcmObjectError(
          {
            error: { code: error instanceof LocalFileError ? error.code : "ReadError", message: String(error).slice(0, 2000) },
            phase: "read",
            writeStatus: "not_attempted",
          },
          { cause: error },
        );
      }
    });
  }

  async get<I extends Input<"get">>(input: I) {
    const args = wshcmSchemas.objects.get.parse(input);
    const { id } = args;
    return this.reads.run(async () => {
      try {
        const destination = await this.destination(args);
        const result = await execute(this.evaluator, { operation: "get_object", id });
        const { ok: _, schemaXml, ...body } = readResponse.parse(result);
        if (body.id !== id) throw new Error("Object response identity mismatch");
        return { ...(await this.output(input, body, destination)), readToken: this.reads.record({ ...body, schemaXml }) };
      } catch (error) {
        if (error instanceof WshcmObjectError) throw error;
        throw new WshcmObjectError(
          {
            error: { code: error instanceof LocalFileError ? error.code : "ReadError", message: String(error).slice(0, 2000) },
            id,
            phase: "read",
            writeStatus: "not_attempted",
          },
          { cause: error },
        );
      }
    });
  }

  async patch<I extends Input<"patch">>(input: I) {
    return this.reads.run(async () => {
      let phase: "input" | "transport" | "readback" = "input";
      let writeStatus: "not_attempted" | "unknown" | "saved" = "not_attempted";
      let knownId: string | undefined;
      try {
        knownId = objectId.parse(input?.id);
        const token = wshcmSchemas.objects.patch.shape.readToken.parse(input?.readToken);
        const expected = this.reads.consume(knownId, token);
        const args = wshcmSchemas.objects.patch.parse(input);
        const destination = await this.destination(args);
        const xml = args.xml ?? (await this.files.readXml(args.inputPath!));
        const inspected = inspectObjectPatchXml(xml, expected);
        const request = {
          operation: "patch_object",
          mode: "patch",
          id: args.id,
          formUrl: expected.formUrl,
          xml,
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
        return await this.output(input, body, destination);
      } catch (error) {
        if (error instanceof WshcmObjectError) throw error;
        throw new WshcmObjectError(
          {
            error: {
              code: error instanceof LocalFileError ? error.code : phase === "input" ? "InvalidInput" : "TransportError",
              message: String(error).slice(0, 2000),
            },
            ...(knownId ? { id: knownId } : {}),
            phase,
            writeStatus: phase === "transport" && error instanceof WshcmDispatchError && !error.dispatched ? "not_attempted" : writeStatus,
          },
          { cause: error },
        );
      }
    });
  }

  listTypes(input: Input<"listTypes"> = {}): Promise<ObjectTypesResult> {
    return listObjectTypes(this.evaluator, input);
  }

  listDataTypes(input: Input<"listDataTypes"> = {}): Promise<ObjectDataTypesResult> {
    return listObjectDataTypes(this.evaluator, input);
  }

  async delete(input: Input<"delete">) {
    const { id, readToken } = wshcmSchemas.objects.delete.parse(input);
    return this.reads.run(async () => {
      let phase: "input" | "transport" | "response" = "input";
      try {
        const { formUrl, xml, schemaXml } = this.reads.consume(id, readToken);
        const script = buildScript(deleteTemplate, { request: encodeRequest({ id, formUrl, xml, schemaXml }) });
        phase = "transport";
        const wire = await this.evaluator.eval(script);
        phase = "response";
        const response = decodeObjectResponse(wire);
        if (typeof response !== "object" || response === null || !("id" in response) || response.id !== id)
          throw new Error("Object deletion response identity mismatch");
        const failed = deleteFailure.safeParse(response);
        if (failed.success) {
          const { error, ...body } = failed.data;
          throw new WshcmObjectDeleteError({ ...body, error: { ...error, message: error.message.slice(0, 2000) } });
        }
        const { ok: _, ...body } = deleteResponse.parse(response);
        return body;
      } catch (error) {
        if (error instanceof WshcmObjectDeleteError) throw error;
        const notAttempted = phase === "input" || (error instanceof WshcmDispatchError && !error.dispatched);
        const message = String(error).slice(0, 2000).toWellFormed();
        const code =
          phase === "input"
            ? message.includes("ReadRequired:")
              ? "ReadRequired"
              : "InvalidInput"
            : phase === "transport"
              ? "TransportError"
              : "InvalidResponse";
        throw new WshcmObjectDeleteError(
          { id, phase, deleteStatus: notAttempted ? "not_attempted" : "unknown", error: { code, message } },
          { cause: error },
        );
      }
    });
  }

  async save<I extends Input<"save">>(input: I) {
    const args = wshcmSchemas.objects.save.parse(input);
    return this.reads.run(async () => {
      let phase: "input" | "transport" | "readback" = "input";
      let writeStatus: "not_attempted" | "unknown" | "saved" = "not_attempted";
      let knownId = args.id;
      try {
        const expected = args.mode === "replace" ? this.reads.consume(args.id!, args.readToken!) : undefined;
        const selectedForm = expected?.formUrl ?? args.formUrl!;
        const destination = await this.destination(args);
        const xml = args.xml ?? (await this.files.readXml(args.inputPath!));
        const inspected = inspectObjectXml(xml, { formUrl: selectedForm, ...(args.id === undefined ? {} : { id: args.id }) });
        const request = {
          operation: "save_object",
          mode: args.mode,
          formUrl: selectedForm,
          id: args.id ?? "",
          xml,
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
        return await this.output(input, body, destination);
      } catch (error) {
        if (error instanceof WshcmObjectError) throw error;
        throw new WshcmObjectError(
          {
            error: {
              code: error instanceof LocalFileError ? error.code : phase === "input" ? "InvalidInput" : "TransportError",
              message: String(error).slice(0, 2000),
            },
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
