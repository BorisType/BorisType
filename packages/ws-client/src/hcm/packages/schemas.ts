import { z } from "zod";
const packagePath = z.string().min(1).max(4096);
const id = z
  .string()
  .regex(/^[1-9][0-9]{0,19}$/)
  .refine((v) => /^[1-9][0-9]{0,19}$/.test(v) && BigInt(v) <= 18446744073709551615n);
const objectIdList = z.array(id).max(10000);
const ids = objectIdList.min(1);
const schemaId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const operation = { operationId: z.uuid().optional() };
const page = { offset: z.number().int().min(0).max(10000000).default(0), limit: z.number().int().min(1).max(1000).default(100) };
const options = {
  includeCategories: z.boolean().default(false),
  includeRelatedObjects: z.boolean().default(false),
  includeFiles: z.boolean().default(false),
  includeAssessmentItems: z.boolean().default(false),
};
const localUrl = z
  .string()
  .max(2048)
  .regex(/^x-local:\/\/[A-Za-z0-9_./-]+$/)
  .refine((v) => !v.split("/").includes("..") && !v.includes("//", 10));
const customTemplates = z
  .array(z.string().regex(/^[a-z][a-z0-9_]*$/))
  .max(1000)
  .describe("Select custom field and page definitions by native object type, for example subdivision or request_type.");
const settings = z.strictObject({
  customTemplates: customTemplates.optional(),
  processCustomTemplates: z.boolean().optional(),
  processAccessRoles: z.boolean().optional(),
  files: z
    .array(
      z.strictObject({
        code: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
        type: z.enum(["courses", "web", "custom_file"]),
        url: localUrl,
        baseUrl: localUrl.optional(),
      }),
    )
    .max(1000)
    .optional(),
});
export const packageSchemas = {
  listSchemas: z.strictObject(page),
  getSchema: z.strictObject({ schemaId, ...page }),
  saveSchema: z
    .strictObject({
      ...operation,
      schemaId: schemaId.optional(),
      revision: revision.optional(),
      name: z.string().trim().min(1).max(1024).optional(),
      settings: settings.optional(),
      editable: z
        .array(z.strictObject({ id, editable: z.boolean() }))
        .max(10000)
        .optional(),
    })
    .refine((v) => (v.schemaId ? !!v.revision : v.revision === undefined && v.name !== undefined && v.editable === undefined)),
  deleteSchema: z.strictObject({ ...operation, schemaId, revision }),
  addObjects: z.strictObject({ ...operation, schemaId, revision, objectIds: ids, ...options }),
  removeObjects: z.strictObject({ ...operation, schemaId, revision, objectIds: ids }),
  exportPackage: z
    .strictObject({
      ...operation,
      schemaId: schemaId.optional(),
      revision: revision.optional(),
      outputPath: packagePath
        .optional()
        .describe("New .zip file inside shared/packages or project. Relative paths use a single project root."),
      objectIds: objectIdList.optional(),
      customTemplates: customTemplates.optional(),
      ...options,
    })
    .refine(
      (v) =>
        v.schemaId !== undefined
          ? v.revision !== undefined && v.objectIds === undefined && v.customTemplates === undefined
          : v.revision === undefined && ((v.objectIds?.length ?? 0) > 0 || (v.customTemplates?.length ?? 0) > 0),
      "Use schemaId with revision, or provide objectIds, customTemplates, or both.",
    ),
  inspectPackage: z
    .strictObject({
      ...operation,
      artifactId: z.uuid().optional(),
      inputPath: packagePath
        .optional()
        .describe("ZIP in shared/packages or a project on the MCP host. Relative paths require one project root."),
      localPath: packagePath.optional().describe("Deprecated alias for inputPath."),
      inspectionId: z.uuid().optional(),
      ...page,
    })
    .refine((v) => [v.artifactId, v.inputPath, v.localPath, v.inspectionId].filter((x) => x !== undefined).length === 1),
  importPackage: z.strictObject({
    ...operation,
    inspectionId: z.uuid(),
    packageIds: z.array(z.string().min(1).max(256)).min(1).max(10000).optional(),
    objectIds: ids.optional(),
    skipConflictingIds: z.boolean().default(false),
    allowVersionMismatch: z.boolean().default(false),
    allowReimport: z.boolean().default(false),
    includeCustomTemplates: z.boolean().default(false),
    includeAccessRoles: z.boolean().default(false),
    includeFiles: z.boolean().default(false),
    includeDeletions: z.boolean().default(false),
    includeLists: z.boolean().default(false),
  }),
  getOperation: z.strictObject({ operationId: z.uuid() }),
} as const;
export type ListPackageSchemasInput = z.input<typeof packageSchemas.listSchemas>;
export type GetPackageSchemaInput = z.input<typeof packageSchemas.getSchema>;
export type SavePackageSchemaInput = z.input<typeof packageSchemas.saveSchema>;
export type DeletePackageSchemaInput = z.input<typeof packageSchemas.deleteSchema>;
export type AddPackageObjectsInput = z.input<typeof packageSchemas.addObjects>;
export type RemovePackageObjectsInput = z.input<typeof packageSchemas.removeObjects>;
export type ExportPackageInput = z.input<typeof packageSchemas.exportPackage>;
export type InspectPackageInput = z.input<typeof packageSchemas.inspectPackage>;
export type ImportPackageInput = z.input<typeof packageSchemas.importPackage>;
export type GetPackageOperationInput = z.input<typeof packageSchemas.getOperation>;
export { id as packageObjectId, settings as packageSettingsSchema };
