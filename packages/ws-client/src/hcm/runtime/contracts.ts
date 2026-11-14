import { z } from "zod";

export const buildIdentitySchema = z.strictObject({
  id: z.string().regex(/^BorisType\.[A-Za-z0-9.]{1,120}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  apiVersion: z.number().int().min(1).max(64),
  // A PE MVID is a .NET GUID; UUID variant/version bits are not an identity requirement.
  buildId: z
    .string()
    .regex(/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/)
    .refine((id) => id !== "00000000-0000-0000-0000-000000000000"),
});
export type RuntimeBuildIdentity = z.infer<typeof buildIdentitySchema>;

const artifactSchema = z.strictObject({
  path: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}$/),
  bytes: z.number().int().min(1).max(4194304),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const componentDescriptorSchema = buildIdentitySchema
  .extend({
    targetFramework: z.literal("net9.0"),
    entryAssembly: z.string(),
    files: z.array(artifactSchema).min(1).max(16),
  })
  .refine(
    (value) =>
      value.entryAssembly === `${value.id}.dll` &&
      value.files.some((file) => file.path === value.entryAssembly) &&
      new Set(value.files.map((file) => file.path.toLowerCase())).size === value.files.length &&
      value.files.reduce((total, file) => total + file.bytes, 0) <= 8388608,
  );
export type RuntimeComponentDescriptor = z.infer<typeof componentDescriptorSchema>;
export const bundleManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  bootstrap: componentDescriptorSchema.refine((value) => /^BorisType\.RuntimeBootstrap\.B[a-fA-F0-9]{64}$/.test(value.id)),
  component: componentDescriptorSchema,
});

const processSchema = z.strictObject({
  pid: z.number().int().positive(),
  startedAt: z.string().datetime({ offset: true }),
  framework: z.string().min(1).max(256),
  architecture: z.string().min(1).max(64),
});
export const runtimeStatusSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(["ready", "restart_required", "blocked", "missing", "installed"]),
  reason: z.string().min(1).max(256),
  expected: buildIdentitySchema.nullable(),
  installed: buildIdentitySchema.nullable(),
  loaded: buildIdentitySchema.nullable(),
  changed: z.boolean(),
  process: processSchema,
});
/** A helper status identifies the answering process. Local/transport failures have process:null. */
export type RuntimeStatus = Omit<z.infer<typeof runtimeStatusSchema>, "process"> & {
  process: z.infer<typeof processSchema> | null;
};

/** A dependent operation cannot run safely; status keeps installed and loaded identity distinct. */
export class WshcmRuntimeError extends Error {
  constructor(
    public readonly status: RuntimeStatus,
    detail?: string,
  ) {
    super(`WSHCM runtime ${status.status}: ${status.reason}${detail ? ` (${detail.slice(0, 2000)})` : ""}`);
    this.name = "WshcmRuntimeError";
  }
}

export function identity(value: RuntimeComponentDescriptor): RuntimeBuildIdentity {
  const { id, version, apiVersion, buildId } = value;
  return { id, version, apiVersion, buildId };
}

/** Compare the bounded semantic version syntax accepted by the managed installer. */
export function compareVersions(left: string, right: string): number {
  const split = (version: string): [string, string | undefined] => {
    const hyphen = version.indexOf("-");
    return hyphen === -1 ? [version, undefined] : [version.slice(0, hyphen), version.slice(hyphen + 1)];
  };
  const [leftCore, leftPre] = split(left);
  const [rightCore, rightPre] = split(right);
  const a = leftCore!.split(".").map(BigInt),
    b = rightCore!.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]! ? 1 : -1;
  if (leftPre === undefined || rightPre === undefined) return leftPre === rightPre ? 0 : leftPre === undefined ? 1 : -1;
  const ap = leftPre.split("."),
    bp = rightPre.split(".");
  for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
    if (ap[i] === bp[i]) continue;
    const an = /^\d+$/.test(ap[i]!),
      bn = /^\d+$/.test(bp[i]!);
    if (an && bn) {
      const leftNumber = BigInt(ap[i]!),
        rightNumber = BigInt(bp[i]!);
      if (leftNumber === rightNumber) continue;
      return leftNumber > rightNumber ? 1 : -1;
    }
    if (an !== bn) return an ? -1 : 1;
    return ap[i]! > bp[i]! ? 1 : -1;
  }
  return ap.length === bp.length ? 0 : ap.length > bp.length ? 1 : -1;
}
