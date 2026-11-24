import { readFileSync, statSync } from "node:fs";
import { WshcmClient } from "@boristype/ws-client";
import { resolvePushConnectionOptions } from "../../core/pushing/config";
import type { PushCommandOptions } from "../../core/pushing/types";
import { startupObjectIdentity, startupObjectLibrary } from "../../core/startup-object-library";

const byteLimit = 256 * 1024;

function readXml(file: string): string {
  const stat = statSync(file);
  if (!stat.isFile() || stat.size < 1 || stat.size > byteLimit) throw new Error("Expected a UTF-8 XML file of 1 byte to 256 KiB");
  const bytes = readFileSync(file);
  if (bytes.length > byteLimit) throw new Error("XML exceeds 256 KiB");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function stringLiteral(value: string): string {
  return JSON.stringify(value).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function readReceipt(response: unknown, id: string, objectType: string, dryRun: boolean): Record<string, unknown> {
  if (typeof response !== "string" || response.length > 32768) throw new Error("Invalid object apply response");
  const result = JSON.parse(response) as Record<string, unknown>;
  if (!result || result.id !== id || result.objectType !== objectType || result.dryRun !== dryRun)
    throw new Error("Object apply response identity or dry-run mismatch");
  if (
    result.ok === false &&
    result.status === "error" &&
    typeof result.error === "string" &&
    typeof result.phase === "string" &&
    (result.writeStatus === "not_attempted" || (!dryRun && (result.writeStatus === "saved" || result.writeStatus === "unknown")))
  )
    return result;
  const statuses = dryRun ? ["would_create", "would_update", "unchanged"] : ["created", "updated", "unchanged"];
  const changed = result.status !== "unchanged";
  if (
    result.ok !== true ||
    result.phase !== "done" ||
    !statuses.includes(String(result.status)) ||
    result.changed !== changed ||
    result.writeStatus !== (changed && !dryRun ? "saved" : "not_attempted")
  )
    throw new Error("Inconsistent object apply response");
  return result;
}

export async function objectsApplyCommand(file: string, options: PushCommandOptions & { dryRun?: boolean }): Promise<void> {
  const { id, objectType } = startupObjectIdentity(file);
  const xml = readXml(file);
  const dryRun = options.dryRun === true;
  const code =
    startupObjectLibrary() +
    "\nreturn EncodeJson(BtApplyStartupObject(" +
    [stringLiteral(xml), stringLiteral(objectType), stringLiteral(id), String(dryRun)].join(", ") +
    "));";
  const { https, host, port, username, password } = resolvePushConnectionOptions(process.cwd(), options);
  const client = new WshcmClient({ overHttps: https, host, port, username, password });
  await client.initialize();
  const evaluator = client.createEvaluator();
  try {
    await evaluator.initialize();
    let result;
    try {
      result = readReceipt(await evaluator.eval(code), id, objectType, dryRun);
    } catch (error) {
      const message = dryRun ? "Preview failed" : "Apply outcome unknown. Check the object before retrying";
      throw new Error(message + ": " + (error as Error).message, { cause: error });
    }
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (!(await evaluator.close())) console.error("Temporary evaluator cleanup unconfirmed");
  }
}
