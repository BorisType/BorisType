import type { z } from "zod";
import { wshcmSchemas } from "./schemas.js";
import type { WshcmEvaluator } from "./types.js";

export interface SystemInfoSummary {
  hcmVersion: string | null;
  osVersion: string | null;
  database: { type: string | null; version: string | null };
  unibridgeVersion: string | null;
  runMode: string | null;
  cluster: boolean | null;
  fullTextIndex: boolean | null;
  personalData: boolean | null;
}

export interface SystemInfoResult {
  summary: SystemInfoSummary;
  /** Present only when includeReport is true; native text without additional redaction. */
  report?: string;
}

const reportBytes = 256 * 1024;

function summary(report: string): SystemInfoSummary {
  const fields = new Map<string, string>();
  for (const line of report.split(/\r\n|\r|\n/)) {
    // Configuration blocks contain their own colons, duplicate keys and XML.
    // Only the overview before the first section supplies summary fields.
    if (/^\s*\/{3,}/.test(line)) break;
    const colon = line.indexOf(":");
    if (colon !== -1) fields.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  const text = (key: string): string | null => fields.get(key) || null;
  const flag = (key: string): boolean | null => {
    const value = text(key)?.toLowerCase();
    if (value === "yes" || value === "on" || value === "true") return true;
    if (value === "no" || value === "off" || value === "false") return false;
    return null;
  };
  return {
    hcmVersion: text("wt version"),
    osVersion: text("os version"),
    database: { type: text("database type"), version: text("db version") },
    unibridgeVersion: text("unibridge version"),
    runMode: text("run mode"),
    cluster: flag("cluster"),
    fullTextIndex: flag("ft index"),
    personalData: flag("personal data"),
  };
}

/** Collect the platform's About/System Information report once, without the file runtime. */
export async function getSystemInfo(evaluator: WshcmEvaluator, input: z.input<typeof wshcmSchemas.systemInfo>): Promise<SystemInfoResult> {
  const { includeReport } = wshcmSchemas.systemInfo.parse(input);
  // A JSON string protects CR/LF from SOAP XML normalization.
  const wire = await evaluator.eval("return EncodeJson(tools_report.gather_system_info());");
  if (typeof wire !== "string" || wire.length > reportBytes * 6 + 2) {
    throw new Error("Invalid system information response or report exceeds 256 KiB UTF-8");
  }
  let report: unknown;
  try {
    report = JSON.parse(wire);
  } catch {
    throw new Error("Invalid system information response: expected a JSON string carrier");
  }
  if (typeof report !== "string" || !report.trim() || !report.isWellFormed()) {
    throw new Error("Invalid system information report: expected nonempty well-formed text");
  }
  if (Buffer.byteLength(report, "utf8") > reportBytes) {
    throw new Error("System information report exceeds 256 KiB UTF-8");
  }
  return { summary: summary(report), ...(includeReport ? { report } : {}) };
}
