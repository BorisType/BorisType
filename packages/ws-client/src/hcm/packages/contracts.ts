import { z } from "zod";
import { packageObjectId, packageSettingsSchema } from "./schemas.js";
export const packageObject = z.strictObject({
  id: packageObjectId,
  type: z.string().max(256),
  name: z.string().max(4096),
  editable: z.boolean(),
});
export const schemaSummary = z.strictObject({
  schemaId: z.string().max(128),
  name: z.string().max(1024),
  objectCount: z.number().int().nonnegative(),
});
export const schemaResult = schemaSummary.extend({
  settings: packageSettingsSchema,
  objects: z.array(packageObject).max(1000),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(1000),
  revision: z.string(),
});
export const operationResult = z.strictObject({
  operationId: z.uuid(),
  accountId: z.string().min(1).max(20),
  targetId: z.string().min(16).max(128),
  operation: z.string().max(32),
  phase: z.string().max(32),
  status: z.enum(["running", "completed", "partial", "failed", "unknown"]),
  verification: z.enum(["platform_report_only", "archive_membership"]),
  error: z.string().max(2000),
  reportIds: z.array(packageObjectId).max(1000),
  downloadIds: z.array(packageObjectId).max(1000),
});
export type PackageSchema = z.infer<typeof schemaResult>;
export type PackageSchemaSummary = z.infer<typeof schemaSummary> & { revision: string };
export type PackageOperation = z.infer<typeof operationResult>;
export interface PackagePage<T> {
  items: T[];
  offset: number;
  limit: number;
  total: number;
}
export interface PackageErrorDetails {
  /** Last acknowledged server receipt; subsequent dispatch may have an unknown outcome. */
  lastKnownOperation?: PackageOperation;
  /** Secondary local cleanup failure; never replaces the primary operation error. */
  cleanupError?: string;
  operationId?: string;
  schemaId?: string;
  phase: string;
  status: "not_attempted" | "unknown" | "failed";
  /** The latest step was rejected before execution, after earlier steps were acknowledged. */
  stepStatus?: "not_attempted";
  code: string;
  message: string;
}
export class WshcmPackageError extends Error {
  readonly details: PackageErrorDetails;
  constructor(details: PackageErrorDetails, options?: ErrorOptions) {
    super(`${details.code}: ${details.message}`, options);
    this.name = "WshcmPackageError";
    this.details = details;
  }
}

/** Keep the most recent acknowledged step when a later part of the same operation fails. */
export function packageStepError(
  cause: unknown,
  fallback: Pick<PackageErrorDetails, "operationId" | "phase" | "code" | "lastKnownOperation">,
): WshcmPackageError {
  if (cause instanceof WshcmPackageError) {
    if (fallback.operationId) cause.details.operationId ??= fallback.operationId;
    if (fallback.lastKnownOperation) {
      const lastKnownOperation = cause.details.lastKnownOperation ?? fallback.lastKnownOperation;
      if (cause.details.status === "not_attempted") {
        return new WshcmPackageError({ ...cause.details, lastKnownOperation, stepStatus: "not_attempted", status: "unknown" }, { cause });
      }
      cause.details.lastKnownOperation = lastKnownOperation;
    }
    return cause;
  }
  return new WshcmPackageError({ ...fallback, status: "unknown", message: String(cause).slice(0, 2000) }, { cause });
}
