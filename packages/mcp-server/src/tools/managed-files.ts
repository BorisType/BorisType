import { readFileSync } from "node:fs";
import type { z } from "zod";
import type { WshcmConnection } from "../connection.js";
import { buildScript } from "../load.js";
import { fileError, MAX_FILE_JSON_BYTES } from "./file-contract.js";

const template = readFileSync(new URL("../../resources/file-operation.bs", import.meta.url), "utf8");
type FileMethod = "ReadJson" | "WriteJson" | "ListJson" | "DeleteJson" | "EditJson";

/** Call the unique managed ABI method after BS resolves the URL; validate both carrier stages and result. */
export async function callManagedFile<T>(
  connection: WshcmConnection,
  method: FileMethod,
  path: string,
  options: object,
  schema: z.ZodType<T>,
): Promise<T> {
  const request = JSON.stringify(options);
  if (Buffer.byteLength(request, "utf8") > MAX_FILE_JSON_BYTES) throw new Error("Request JSON exceeds 8 MiB");
  const wire = await connection.evaluator.eval(buildScript(template, { path, request, method }));
  if (typeof wire !== "string") throw new Error("Expected a string file operation carrier from WSHCM");
  if (wire.length > 2 * MAX_FILE_JSON_BYTES + 2) throw new Error("File operation carrier exceeds its limit");
  const json: unknown = JSON.parse(wire);
  if (typeof json !== "string") throw new Error("Expected a string DLL response inside the file operation carrier");
  if (Buffer.byteLength(json, "utf8") > MAX_FILE_JSON_BYTES) throw new Error("Response JSON exceeds 8 MiB");
  const body: unknown = JSON.parse(json);
  const failure = fileError.safeParse(body);
  if (failure.success) {
    const { code, message, editIndex } = failure.data.error;
    throw new Error(`${editIndex === undefined ? "" : `Edit #${editIndex}: `}${code}: ${message}`);
  }
  return schema.parse(body);
}

/** Convert managed/transport/validation failures to the standard MCP tool error result. */
export async function fileTool(action: () => Promise<string>) {
  try {
    return { content: [{ type: "text" as const, text: await action() }] };
  } catch (error) {
    return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
  }
}
