import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectPackageArchive, type PackageArchiveInspection } from "./archive.js";
import { uploadPackage, downloadPackage, hashRemotePackage } from "./transfer.js";
import type { PackageArtifact } from "./artifacts.js";
import type { WshcmEvaluator } from "../types.js";
import { packageSchemas } from "./schemas.js";
import {
  operationResult,
  schemaResult,
  schemaSummary,
  WshcmPackageError,
  type PackagePage,
  type PackageSchema,
  type PackageSchemaSummary,
} from "./contracts.js";
import { packageNative } from "./native.js";
import { PackageArtifactStore } from "./artifacts.js";
type Input<K extends keyof typeof packageSchemas> = z.input<(typeof packageSchemas)[K]>;
// Keep public schemas JSON Schema serializable; normalize only public UUID handles
// after validation and before native dispatch, local map lookup or artifact access.
function canonicalHandles<T extends object>(args: T): T {
  for (const key of ["operationId", "artifactId", "inspectionId"] as const) {
    if (key in args) {
      const value = args[key as keyof T];
      if (typeof value === "string") Object.assign(args, { [key]: value.toLowerCase() });
    }
  }
  return args;
}

const snapshot = z
  .string()
  .max(33554432)
  .refine((v) => Buffer.byteLength(v) <= 33554432);
const readSchema = z.strictObject({ snapshot, result: schemaResult.omit({ revision: true }) });
const mutation = z.strictObject({ schemaId: z.string(), operation: operationResult, errors: z.array(z.string()).max(10000) });
const nativePreview = z.strictObject({
  serverVersion: z.string().max(128),
  parts: z
    .array(
      z.strictObject({
        id: z.string().max(256),
        type: z.enum(["objects", "courses", "web", "custom_file"]),
        versionMismatch: z.boolean(),
        alreadyImported: z.boolean(),
        objects: z.array(z.strictObject({ id: z.string(), conflict: z.boolean() })).max(10000),
      }),
    )
    .max(10000),
  operation: operationResult,
});
export interface PackageInspectionItem {
  kind: "package" | "object";
  packageId: string;
  type: string;
  id?: string;
  name?: string;
  nameTruncated?: boolean;
  conflict?: boolean;
  versionMismatch?: boolean;
  alreadyImported?: boolean;
  serverVersion?: string;
  hasCustomTemplates?: boolean;
  hasAccessRoles?: boolean;
  hasLists?: boolean;
  deletionCount?: number;
}
interface Inspection {
  artifact: PackageArtifact;
  archive: PackageArchiveInspection;
  sourceId: string;
  items: PackageInspectionItem[];
  operation: z.infer<typeof operationResult>;
  attempted: boolean;
}
export class WshcmPackages {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly snapshots = new Map<string, string>();
  private readonly inspections = new Map<string, Inspection>();
  private readonly operationArtifacts = new Map<string, PackageArtifact>();
  readonly artifacts: PackageArtifactStore;
  constructor(
    private readonly evaluator: WshcmEvaluator,
    options: { artifactDirectory?: string } = {},
  ) {
    this.artifacts = new PackageArtifactStore(options.artifactDirectory);
  }
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => {});
    return next;
  }
  private record(xml: string): string {
    const revision = createHash("sha256").update(xml).digest("hex");
    this.snapshots.set(revision, xml);
    if (this.snapshots.size > 32) this.snapshots.delete(this.snapshots.keys().next().value!);
    return revision;
  }
  private expected(revision: string): string {
    const xml = this.snapshots.get(revision);
    if (xml === undefined)
      throw new WshcmPackageError({
        code: "ReadRequired",
        message: "Read the common schema document in this SDK instance",
        phase: "input",
        status: "not_attempted",
      });
    return xml;
  }
  async listSchemas(input: Input<"listSchemas"> = {}): Promise<PackagePage<PackageSchemaSummary>> {
    const args = canonicalHandles(packageSchemas.listSchemas.parse(input));
    return this.run(async () => {
      const body = await packageNative(
        this.evaluator,
        { operation: "list", operationId: randomUUID(), ...args },
        z.strictObject({
          snapshot,
          result: z.strictObject({
            items: z.array(schemaSummary).max(1000),
            total: z.number().int().nonnegative(),
            offset: z.number().int(),
            limit: z.number().int(),
          }),
        }),
      );
      const revision = this.record(body.snapshot);
      return { ...body.result, items: body.result.items.map((v) => ({ ...v, revision })) };
    });
  }
  async getSchema(input: Input<"getSchema">): Promise<PackageSchema> {
    const args = canonicalHandles(packageSchemas.getSchema.parse(input));
    return this.run(() => this.read(args));
  }
  private async read(args: { schemaId: string; offset: number; limit: number }): Promise<PackageSchema> {
    const body = await packageNative(this.evaluator, { operation: "get", operationId: randomUUID(), ...args }, readSchema);
    return { ...body.result, revision: this.record(body.snapshot) };
  }
  private async change(operation: string, args: { schemaId?: string; revision?: string } & Record<string, unknown>) {
    const body = await packageNative(
      this.evaluator,
      {
        ...args,
        operation,
        operationId: args.operationId ?? randomUUID(),
        ...(args.revision ? { expected: this.expected(args.revision) } : {}),
      },
      mutation,
    );
    try {
      const fresh = await this.read({ schemaId: body.schemaId, offset: 0, limit: 100 });
      return { ...body, revision: fresh.revision };
    } catch (error) {
      throw new WshcmPackageError({
        code: "ReadbackError",
        message: String(error).slice(0, 2000),
        operationId: body.operation.operationId,
        phase: "readback",
        status: "unknown",
      });
    }
  }
  saveSchema(input: Input<"saveSchema">) {
    const args = canonicalHandles(packageSchemas.saveSchema.parse(input));
    return this.run(() => this.change("save", args));
  }
  deleteSchema(input: Input<"deleteSchema">) {
    const args = canonicalHandles(packageSchemas.deleteSchema.parse(input));
    return this.run(() =>
      packageNative(
        this.evaluator,
        { ...args, operation: "delete", operationId: args.operationId ?? randomUUID(), expected: this.expected(args.revision) },
        mutation,
      ),
    );
  }
  addObjects(input: Input<"addObjects">) {
    const args = canonicalHandles(packageSchemas.addObjects.parse(input));
    args.objectIds = [...new Set(args.objectIds)];
    return this.run(() => this.change("add", args));
  }
  removeObjects(input: Input<"removeObjects">) {
    const args = canonicalHandles(packageSchemas.removeObjects.parse(input));
    args.objectIds = [...new Set(args.objectIds)];
    return this.run(() => this.change("remove", args));
  }
  async exportPackage(input: Input<"exportPackage">) {
    const args = canonicalHandles(packageSchemas.exportPackage.parse(input));
    if (args.objectIds) args.objectIds = [...new Set(args.objectIds)];
    return this.run(async () => {
      const operationId = args.operationId ?? randomUUID();
      const result = await packageNative(
        this.evaluator,
        { ...args, operation: "export", operationId, ...(args.revision ? { expected: this.expected(args.revision) } : {}) },
        z.strictObject({
          sizeBytes: z.number().int().min(0).max(134217728),
          requestedIds: z.array(z.string()).max(10000),
          errors: z.array(z.string()).max(10000),
          operation: operationResult,
        }),
      );
      let directory: string | undefined;
      async function cleanup(): Promise<string | undefined> {
        if (directory === undefined) return;
        try {
          await rm(directory, { recursive: true, force: true });
          directory = undefined;
        } catch (error) {
          return String(error).slice(0, 2000);
        }
      }
      try {
        directory = await mkdtemp(join(tmpdir(), "boristype-package-"));
        const downloaded = await downloadPackage(this.evaluator, operationId, result.sizeBytes, directory);
        const artifact = await this.artifacts.capture(downloaded);
        this.operationArtifacts.set(operationId, artifact);
        const archive = await inspectPackageArchive(artifact.localPath);
        const objects = archive.packages.flatMap((p) =>
          p.objects.map((o) => ({ ...o, name: o.name.slice(0, 4096), nameTruncated: o.name.length > 4096 })),
        );
        const actual = new Set(objects.map((o) => o.id));
        const missing = [...new Set([...(args.objectIds ?? []), ...result.requestedIds])].filter((id) => !actual.has(id));
        result.operation = await packageNative(
          this.evaluator,
          { operation: "finish_export", operationId, partial: missing.length > 0 || result.errors.length > 0 },
          operationResult,
        );
        const cleanupError = await cleanup();
        return {
          operationId,
          artifact,
          ...(cleanupError ? { cleanupError } : {}),
          status:
            missing.length || result.errors.length || result.operation.status === "partial" ? ("partial" as const) : ("completed" as const),
          verification: "archive_membership" as const,
          objects: { items: objects.slice(0, 100), offset: 0, limit: 100, total: objects.length },
          missingIds: missing.slice(0, 1000),
          missingCount: missing.length,
          errors: result.errors.slice(0, 100),
          operation: result.operation,
        };
      } catch (error) {
        const failure =
          error instanceof WshcmPackageError
            ? error
            : new WshcmPackageError({
                operationId,
                code: "ArchiveError",
                message: String(error).slice(0, 2000),
                phase: "archive",
                status: "unknown",
              });
        failure.details.lastKnownOperation ??= structuredClone(result.operation);
        const cleanupError = await cleanup();
        if (cleanupError) failure.details.cleanupError = cleanupError;
        throw failure;
      }
    });
  }
  private manifest(archive: PackageArchiveInspection) {
    if (archive.packages.length > 10000 || archive.packages.reduce((n, p) => n + p.objects.length, 0) > 10000)
      throw new WshcmPackageError({
        code: "InputLimit",
        message: "Preview exceeds 10000 objects/packages",
        phase: "input",
        status: "not_attempted",
      });
    for (const p of archive.packages)
      if (
        p.url.length > 2048 ||
        (p.baseUrl?.length ?? 0) > 2048 ||
        (p.serverVersion?.length ?? 0) > 128 ||
        p.objects.some((o) => o.type.length > 256)
      )
        throw new WshcmPackageError({
          code: "InputLimit",
          message: "Package metadata exceeds limits",
          phase: "input",
          status: "not_attempted",
        });
    return archive.packages.map((p) => ({
      id: p.id,
      type: p.type,
      url: p.url,
      objectCount: p.objects.length,
      objectTypes: Object.fromEntries(p.objects.map((o) => [o.id, o.type])),
    }));
  }
  private selection(
    inspection: Omit<Inspection, "operation" | "items" | "attempted">,
    args?: z.output<typeof packageSchemas.importPackage>,
  ) {
    const packageIds = args?.packageIds ?? inspection.archive.packages.map((p) => p.id);
    const parts = inspection.archive.packages.filter((p) => packageIds.includes(p.id));
    if (parts.length !== new Set(packageIds).size)
      throw new WshcmPackageError({
        code: "InvalidSelection",
        message: "Package outside inspection",
        phase: "input",
        status: "not_attempted",
      });
    const allowed = new Set(parts.flatMap((p) => p.objects.map((o) => o.id)));
    const objectIds = args?.objectIds ?? [...allowed];
    if (objectIds.some((id) => !allowed.has(id)))
      throw new WshcmPackageError({
        code: "InvalidSelection",
        message: "Object outside selected inspected packages",
        phase: "input",
        status: "not_attempted",
      });
    if (args?.includeFiles)
      for (const p of parts)
        if (p.type === "custom_file" && !/^x-local:\/\/custom\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\/?$/.test(p.baseUrl ?? ""))
          throw new WshcmPackageError({
            code: "UnsafeDestination",
            message: "custom_file requires a safe destination below x-local://custom/",
            phase: "input",
            status: "not_attempted",
          });
    if (
      args &&
      objectIds.length === 0 &&
      !args.includeFiles &&
      !args.includeCustomTemplates &&
      !args.includeAccessRoles &&
      !args.includeDeletions &&
      !args.includeLists
    )
      throw new WshcmPackageError({
        code: "InvalidSelection",
        message: "No inspected objects or explicit extras selected",
        phase: "input",
        status: "not_attempted",
      });
    return {
      selectedPackages: Object.fromEntries(packageIds.map((id) => [id, true])),
      selectedObjects: Object.fromEntries(objectIds.map((id) => [id, true])),
    };
  }
  private previewRequest(
    inspection: Omit<Inspection, "operation" | "items" | "attempted">,
    args?: z.output<typeof packageSchemas.importPackage>,
  ) {
    return {
      sourceId: inspection.sourceId,
      sha256: inspection.artifact.sha256,
      manifest: this.manifest(inspection.archive),
      ...this.selection(inspection, args),
      includeFiles: args?.includeFiles ?? false,
      includeCustomTemplates: args?.includeCustomTemplates ?? false,
      includeAccessRoles: args?.includeAccessRoles ?? false,
      includeDeletions: args?.includeDeletions ?? false,
      includeLists: args?.includeLists ?? false,
      allowVersionMismatch: args?.allowVersionMismatch ?? false,
      allowReimport: args?.allowReimport ?? false,
      skipConflictingIds: args?.skipConflictingIds ?? false,
    };
  }
  async inspectPackage(input: Input<"inspectPackage">) {
    const args = canonicalHandles(packageSchemas.inspectPackage.parse(input));
    return this.run(async () => {
      let inspectionId = args.inspectionId;
      let state: Inspection | undefined;
      if (inspectionId) {
        state = this.inspections.get(inspectionId);
        if (!state)
          throw new WshcmPackageError({
            code: "InspectionRequired",
            message: "Unknown inspection in this SDK instance",
            phase: "input",
            status: "not_attempted",
          });
        await this.artifacts.get(state.artifact.artifactId);
        const receipt = await this.getOperation({ operationId: inspectionId });
        if (receipt.accountId !== state.operation.accountId || receipt.targetId !== state.operation.targetId)
          throw new Error("Inspection context changed");
      } else {
        const artifact = await this.artifacts.capture(args.localPath ?? (await this.artifacts.get(args.artifactId!)).localPath);
        const archive = await inspectPackageArchive(artifact.localPath);
        this.manifest(archive);
        inspectionId = args.operationId ?? randomUUID();
        const sourceId = inspectionId;
        const draft = {
          artifact,
          archive,
          sourceId,
        };
        await uploadPackage(this.evaluator, sourceId, artifact);
        const preview = await packageNative(
          this.evaluator,
          { operation: "preview", operationId: inspectionId, ...this.previewRequest(draft) },
          nativePreview,
        );
        state = { ...draft, operation: preview.operation, items: [], attempted: false };
        for (const part of archive.packages) {
          const native = preview.parts.find((p) => p.id === part.id);
          if (!native) throw new Error("Native inspection identity mismatch");
          state.items.push({
            kind: "package",
            packageId: part.id,
            type: part.type,
            versionMismatch: native.versionMismatch,
            alreadyImported: native.alreadyImported,
            ...(part.serverVersion ? { serverVersion: part.serverVersion } : {}),
            hasCustomTemplates: part.hasCustomTemplates,
            hasAccessRoles: part.hasAccessRoles,
            hasLists: part.hasLists,
            deletionCount: part.deletedObjectIds.length,
          });
          for (const obj of part.objects) {
            const checked = native.objects.find((o) => o.id === obj.id);
            if (!checked) throw new Error("Native inspection object mismatch");
            state.items.push({
              kind: "object",
              packageId: part.id,
              ...obj,
              name: obj.name.slice(0, 4096),
              nameTruncated: obj.name.length > 4096,
              conflict: checked.conflict,
            });
          }
        }
        this.inspections.set(inspectionId, state);
        this.operationArtifacts.set(inspectionId, artifact);
      }
      const items = state.items.slice(args.offset, args.offset + args.limit);
      return {
        inspectionId,
        artifact: { ...state.artifact },
        operation: structuredClone(state.operation),
        items: structuredClone(items),
        offset: args.offset,
        limit: args.limit,
        total: state.items.length,
      };
    });
  }
  async importPackage(input: Input<"importPackage">) {
    const args = canonicalHandles(packageSchemas.importPackage.parse(input));
    return this.run(async () => {
      const state = this.inspections.get(args.inspectionId);
      if (!state)
        throw new WshcmPackageError({
          code: "InspectionRequired",
          message: "Inspect the archive in this SDK instance first",
          phase: "input",
          status: "not_attempted",
        });
      if (state.attempted && !args.allowReimport)
        throw new WshcmPackageError({
          code: "Reimport",
          message: "An import was already dispatched; query its receipt before another explicit attempt",
          phase: "input",
          status: "not_attempted",
        });
      const request = this.previewRequest(state, args);
      await this.artifacts.get(state.artifact.artifactId);
      if ((await hashRemotePackage(this.evaluator, state.sourceId, state.artifact.sizeBytes)) !== state.artifact.sha256)
        throw new WshcmPackageError({
          code: "IntegrityChanged",
          message: "Remote archive bytes changed",
          phase: "input",
          status: "not_attempted",
        });
      const operationId = args.operationId ?? randomUUID();
      try {
        const result = await packageNative(this.evaluator, { ...request, operation: "import", operationId }, operationResult);
        state.attempted = true;
        return result;
      } catch (error) {
        if (!(error instanceof WshcmPackageError) || error.details.status === "unknown") state.attempted = true;
        throw error;
      }
    });
  }
  async getOperation(input: Input<"getOperation">) {
    const args = canonicalHandles(packageSchemas.getOperation.parse(input));
    const result = await packageNative(this.evaluator, { operation: "status", ...args }, operationResult);
    const artifact = this.operationArtifacts.get(args.operationId);
    return { ...result, ...(artifact ? { artifact: { ...artifact } } : {}) };
  }
}

export type ListPackageSchemasResult = Awaited<ReturnType<WshcmPackages["listSchemas"]>>;
export type GetPackageSchemaResult = Awaited<ReturnType<WshcmPackages["getSchema"]>>;
export type SavePackageSchemaResult = Awaited<ReturnType<WshcmPackages["saveSchema"]>>;
export type DeletePackageSchemaResult = Awaited<ReturnType<WshcmPackages["deleteSchema"]>>;
export type AddPackageObjectsResult = Awaited<ReturnType<WshcmPackages["addObjects"]>>;
export type RemovePackageObjectsResult = Awaited<ReturnType<WshcmPackages["removeObjects"]>>;
export type ExportPackageResult = Awaited<ReturnType<WshcmPackages["exportPackage"]>>;
export type InspectPackageResult = Awaited<ReturnType<WshcmPackages["inspectPackage"]>>;
export type ImportPackageResult = Awaited<ReturnType<WshcmPackages["importPackage"]>>;
export type GetPackageOperationResult = Awaited<ReturnType<WshcmPackages["getOperation"]>>;
