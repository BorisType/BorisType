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
    const limit = Math.max(stringLimit, identityFields.has(field) ? 256 : field === "localPath" ? 4096 : 0);
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
  const lifecycle =
    " Exact object IDs are decimal strings. Supply a UUID operationId before long/mutating calls; public operationId/artifactId/inspectionId handles are canonicalized to lowercase; timeout does not cancel native work. Query get_package_operation before any explicit retry. No automatic retry, rollback, atomic CAS or exactly-once guarantee.";
  const links =
    " includeRelatedObjects uses native XMD/foreign links only; wvars/mode resolvers and complete dependency closure are not implemented.";
  function register<K extends keyof typeof packageSchemas>(name: string, method: K, description: string, annotations = mutation) {
    server.registerTool(
      "wshcm_" + name,
      { description: description + lifecycle, inputSchema: boundedInput(packageSchemas[method]), annotations },
      (input) => packageResult(() => api.packages[method](input as never), method, input as RecordValue),
    );
  }
  register(
    "list_package_schemas",
    "listSchemas",
    "List saved schemas by offset/limit (default 100, max 1000); returns a common-document revision. Never switches the UI current schema.",
    read,
  );
  register(
    "get_package_schema",
    "getSchema",
    "Read one saved schema by explicit schemaId and paginated objects; revision is required for mutations in this MCP instance.",
    read,
  );
  register(
    "save_package_schema",
    "saveSchema",
    "Create a named schema or change name/settings/editable flags using schemaId/revision. To include custom field definitions, set settings.processCustomTemplates to true and list native object types in settings.customTemplates. Rechecks the shared document before saving; other schemas and UI selection are preserved.",
  );
  register(
    "delete_package_schema",
    "deleteSchema",
    "Delete one saved schema using explicit schemaId/revision. Deletes no packaged target objects.",
  );
  register(
    "add_package_objects",
    "addObjects",
    "Add exact IDs to one saved schema using its revision and explicit inclusion flags." + links,
  );
  register(
    "remove_package_objects",
    "removeObjects",
    "Remove exact IDs from one saved schema using its revision. Deletes no target objects.",
  );
  register(
    "export_package",
    "exportPackage",
    "Build a ZIP from schemaId/revision or directly from objectIds and/or customTemplates. Direct export does not save a schema. customTemplates selects native object types and includes all their configured templates, for example all request_type templates. Returns artifactId/localPath/sizeBytes/sha256 on the MCP host. Native temporary files/reports are side effects. Check missingCount, customTemplateTypes and missingCustomTemplates." +
      links,
    temporary,
  );
  register(
    "inspect_package",
    "inspectPackage",
    "Preview an artifactId OR absolute localPath on the MCP host, or page an existing inspectionId. Package rows report the customTemplateTypes found in the ZIP. Captures an immutable copy and uploads it for native preview; does not apply target objects. Handles last 24 hours; inspection bindings belong to this instance. ZIP 128 MiB, expanded 512 MiB, 10000 entries, depth 2, XML 32 MiB; page limit 1–1000.",
    temporary,
  );
  register(
    "import_package",
    "importPackage",
    "Apply the entire immutable inspected composition by default; pagination is presentation only. Optional packageIds/objectIds may select any member in that snapshot. Rechecks conflicts. Version mismatch/reimport and templates/roles/files/lists/deletions require explicit opt-ins. Supports objects/courses/web/custom_file only; custom_file destinations must be below x-local://custom/. Completed with platform_report_only is not per-object success proof.",
  );
  register(
    "get_package_operation",
    "getOperation",
    "Read the durable native operation receipt by caller-known operationId on the same target/account. Status may be running/completed/partial/failed/unknown; local artifact association exists only in this instance.",
    read,
  );
}
