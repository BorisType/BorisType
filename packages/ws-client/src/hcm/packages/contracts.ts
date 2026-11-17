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
  operationId?: string;
  phase: string;
  status: "not_attempted" | "unknown" | "failed";
  code: string;
  message: string;
}
export class WshcmPackageError extends Error {
  readonly details: PackageErrorDetails;
  constructor(details: PackageErrorDetails) {
    super(`${details.code}: ${details.message}`);
    this.name = "WshcmPackageError";
    this.details = details;
  }
}
