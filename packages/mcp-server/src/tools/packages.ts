import { connectionDiagnostic } from "../connection-error.js";
import type { McpServer, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { packageSchemas, WshcmPackageError, type WshcmApi } from "@boristype/ws-client";

const MAX_TEXT_BYTES = 256 * 1024;
function output(body: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(body) }], ...(isError ? { isError: true } : {}) };
}

/** Keep SDK validation and JSON Schema, bounding diagnostics before MCP formats them. */
function boundedInput(schema: StandardSchemaWithJSON): StandardSchemaWithJSON {
  return {
    "~standard": {
      ...schema["~standard"],
      async validate(value) {
        let result;
        try {
          result = await schema["~standard"].validate(value);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            JSON.stringify({
              code: "InvalidInput",
              phase: "input",
              status: "not_attempted",
              message: message.slice(0, 4096),
              truncated: message.length > 4096,
            }),
          );
        }
        if (result.issues) {
          const issues = result.issues.slice(0, 8).map((issue) => ({ message: issue.message.slice(0, 256) }));
          throw new Error(
            JSON.stringify({
              code: "InvalidInput",
              phase: "input",
              status: "not_attempted",
              message: "Arguments do not match the published tool schema",
              issues,
              truncated: result.issues.length > issues.length || result.issues.some((issue) => issue.message.length > 256),
            }),
          );
        }
        return result;
      },
    },
  };
}

type RecordValue = Record<string, unknown>;
/** Presentation only: never changes SDK selection, native work or stored artifacts. */
function present(value: unknown, method: string, input: RecordValue): RecordValue {
  const truncatedFields = new Set<string>();
  const identityFields = new Set([
    "operationId",
    "inspectionId",
    "artifactId",
    "schemaId",
    "id",
    "packageId",
    "reportIds",
    "downloadIds",
    "missingIds",
    "revision",
    "type",
    "accountId",
    "targetId",
    "phase",
    "status",
    "code",
    "verification",
    "sha256",
    "expiresAt",
    "mimeType",
  ]);
  function copy(value: unknown, path: string, arrayLimit: number, stringLimit = 4096): unknown {
    const field = path.slice(path.lastIndexOf(".") + 1).replace(/\[\d+\]$/, "");
    // Valid identities fit 256 characters; artifact paths retain their full input bound.
    const limit = Math.max(stringLimit, identityFields.has(field) ? 256 : field === "localPath" || field === "exportPath" ? 4096 : 0);
    if (typeof value === "string" && value.length > limit) {
      truncatedFields.add(path);
      return value.slice(0, limit);
    }
    if (Array.isArray(value)) {
      if (value.length > arrayLimit) truncatedFields.add(path);
      return value.slice(0, arrayLimit).map((v, i) => copy(v, `${path}[${i}]`, arrayLimit, stringLimit));
    }
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v, path ? `${path}.${k}` : k, arrayLimit, stringLimit)]));
    return value;
  }
  let body = copy(value, "", 1000) as RecordValue;
  const page = method === "exportPackage" ? (body["objects"] as RecordValue) : body;
  const field = method === "getSchema" ? "objects" : "items";
  const items = page?.[field];
  if (Array.isArray(items)) {
    while (Buffer.byteLength(JSON.stringify(body)) > MAX_TEXT_BYTES - 8192 && items.length > 1) {
      items.splice(Math.ceil(items.length / 2));
      truncatedFields.add(method === "exportPackage" ? "objects.items" : field);
    }
  }
  function decorate() {
    const page = method === "exportPackage" ? (body["objects"] as RecordValue) : body;
    const items = page?.[field];
    if (Array.isArray(items)) {
      const total = Number(page[method === "getSchema" ? "objectCount" : "total"]);
      const offset = Number(page["offset"]);
      if (offset + items.length < total) {
        page["limit"] = items.length;
        body["truncated"] = true;
        const nextOffset = offset + items.length;
        body["nextPage"] =
          method === "exportPackage"
            ? {
                tool: "wshcm_inspect_package",
                offset: 0,
                arguments: { artifactId: (body["artifact"] as RecordValue)["artifactId"], limit: 100 },
              }
            : {
                tool: {
                  listSchemas: "wshcm_list_package_schemas",
                  getSchema: "wshcm_get_package_schema",
                  inspectPackage: "wshcm_inspect_package",
                }[method],
                offset: nextOffset,
                arguments: {
                  ...(method === "getSchema" ? { schemaId: input["schemaId"] } : {}),
                  ...(method === "inspectPackage" ? { inspectionId: body["inspectionId"] } : {}),
                  offset: nextOffset,
                  limit: Math.max(1, items.length),
                },
              };
      }
    }
    if (truncatedFields.size) {
      body["truncated"] = true;
      body["truncatedFields"] = [...truncatedFields].slice(0, 32);
      body["diagnosticsHint"] =
        "Use nextPage for remaining rows. Diagnostics/settings may be abbreviated; consult native reportIds/downloadIds and the SDK for full details. Never retry an unknown mutation automatically.";
    }
  }
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_TEXT_BYTES - 8192) body = copy(body, "", 16) as RecordValue;
  decorate();
  // JSON escaping and the markers count toward the limit. Rebuild continuation
  // after every reduction so it starts after the rows actually returned.
  let arrayLimit = 8;
  let stringLimit = 4096;
  while (Buffer.byteLength(JSON.stringify(body)) > MAX_TEXT_BYTES) {
    body = copy(body, "", arrayLimit, stringLimit) as RecordValue;
    decorate();
    if (arrayLimit > 1) arrayLimit = Math.floor(arrayLimit / 2);
    else stringLimit = Math.max(1, Math.floor(stringLimit / 2));
  }

  return body;
}

async function packageResult(action: () => Promise<unknown>, method: string, input: RecordValue) {
  try {
    return output(present(await action(), method, input));
  } catch (error) {
    return output(
      present(
        error instanceof WshcmPackageError
          ? { ...error.details, ...connectionDiagnostic(error) }
          : {
              code: "PackageToolError",
              phase: "adapter",
              status: "unknown",
              message: error instanceof Error ? error.message : String(error),
            },
        method,
        input,
      ),
      true,
    );
  }
}

export function registerPackageTools(server: McpServer, api: WshcmApi): void {
  const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  const temporary = { ...read, readOnlyHint: false };
  const mutation = { ...temporary, destructiveHint: true };
  const receipt =
    " Choose a UUID operationId before dispatch. UUID handles are canonicalized to lowercase. After timeout, check wshcm_get_package_operation on the same HCM and account before retrying. Timeout does not stop native work.";
  const links =
    " includeRelatedObjects uses native XMD/foreign links only; wvars/mode resolvers and complete dependency closure are not implemented.";
  function register<K extends keyof typeof packageSchemas>(name: string, method: K, description: string, annotations = mutation) {
    server.registerTool("wshcm_" + name, { description, inputSchema: boundedInput(packageSchemas[method]), annotations }, (input) =>
      packageResult(() => api.packages[method](input as never), method, input as RecordValue),
    );
  }
  register(
    "list_package_schemas",
    "listSchemas",
    "Find saved package schemas by name in paginated items (offset/limit, default 100, max 1000). Each row has schemaId, name, objectCount and the shared document revision. Pass schemaId to wshcm_get_package_schema for settings and membership. The UI's current selection is preserved.",
    read,
  );
  register(
    "get_package_schema",
    "getSchema",
    "Read settings and members of a saved schema by schemaId. Returns name, objectCount, a page of objects with editable flags, and revision. Follow nextPage when present. Use the revision from this MCP instance to modify or export the schema. A change to any schema can stale this shared document revision.",
    read,
  );
  register(
    "save_package_schema",
    "saveSchema",
    "Create a saved package schema with name, or supply schemaId/revision to change its name, settings or members' editable flags. To include custom fields, enable settings.processCustomTemplates and list types in settings.customTemplates. Returns schemaId, revision, operation and errors. Change membership with wshcm_add_package_objects or wshcm_remove_package_objects." +
      receipt,
  );
  register(
    "delete_package_schema",
    "deleteSchema",
    "Delete one saved schema using schemaId and the current revision. Returns schemaId, operation and errors. Objects in the schema remain in HCM. To exclude only some members use wshcm_remove_package_objects." +
      receipt,
  );
  register(
    "add_package_objects",
    "addObjects",
    "Add objectIds (exact decimal strings) to a saved schema with schemaId/revision. includeCategories, includeRelatedObjects, includeFiles and includeAssessmentItems default to false. Check operation and errors, then read the schema to review membership. Use the fresh revision for the next edit." +
      links +
      receipt,
  );
  register(
    "remove_package_objects",
    "removeObjects",
    "Remove the specified decimal objectIds from a saved schema using schemaId/revision. Returns a fresh revision, operation and errors. The documents remain in HCM. Export again to obtain a ZIP with the updated membership." +
      receipt,
  );
  register(
    "export_package",
    "exportPackage",
    "Build a ZIP from schemaId/revision, or directly from decimal objectIds and/or customTemplates without saving a schema. Each selected type includes all its configured templates. Returns exportPath on the MCP host (default ~/.boristype/packages/export/<operationId>.zip) and a private artifact.{artifactId,localPath,sizeBytes,sha256}. Set outputPath to a new .zip in shared export or a project directory; a relative path uses a single project root. Project subdirectories must already exist. Check status, missingCount and missingCustomTemplates against the actual archive. Use wshcm_inspect_package on the intended target. Export creates temporary files/reports." +
      links +
      receipt,
    temporary,
  );
  register(
    "inspect_package",
    "inspectPackage",
    "Preview an exported artifactId, or pass localPath to a ZIP in either shared directory (~/.boristype/packages/import or export) or a project directory on the MCP host. Use exportPath directly across instances sharing that directory. Relative paths use a single project root. On PackageFileNotFound, correct localPath and retry. Preview uploads the validated copy to the configured HCM before import. Returns inspectionId, artifact, operation and paged items including conflicts and customTemplateTypes. For more rows pass inspectionId/offset/limit. The 24-hour artifact and this instance's inspection are required for import. ZIP 128 MiB, expanded 512 MiB, 10000 entries, depth 2, XML 32 MiB." +
      receipt,
    temporary,
  );
  register(
    "import_package",
    "importPackage",
    "Import by inspectionId from wshcm_inspect_package in this instance. By default selects the entire immutable inspected composition across all preview pages. Restrict by packageIds/objectIds for a subset. Rechecks hash and conflicts. Templates, roles, files, lists, deletions, version mismatch and reimport require explicit opt-ins. Supports objects/courses/web/custom_file. custom_file destinations must be below x-local://custom/. The returned receipt with platform_report_only calls for readback to confirm individual objects." +
      receipt,
  );
  register(
    "get_package_operation",
    "getOperation",
    "Look up a previous operationId on the same HCM/account, including after timeout. UUID handles are canonicalized to lowercase. Returns the native receipt with status, phase, verification, reportIds and downloadIds. Status may be running/completed/partial/failed/unknown. ReceiptUnavailable leaves the outcome unknown. The exporting instance also returns the local artifact and the exportPath when publication succeeded.",
    read,
  );
}
