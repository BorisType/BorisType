import { connectionDiagnostic } from "../connection-error.js";
import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, WshcmObjectDeleteError, WshcmObjectError, type WshcmApi } from "@boristype/ws-client";

function output(body: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(body) }], ...(isError ? { isError: true } : {}) };
}
async function objectResult(action: () => Promise<unknown>) {
  try {
    return output(await action());
  } catch (error) {
    if (error instanceof WshcmObjectError || error instanceof WshcmObjectDeleteError)
      return output({ ...error.details, ...connectionDiagnostic(error) }, true);
    const connection = connectionDiagnostic(error);
    if (connection) return output(connection, true);
    throw error;
  }
}

export function registerObjectTools(server: McpServer, api: WshcmApi): void {
  const readAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  const writeAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
  const description =
    " Uses platform XML API without a DLL. Form loading and initialization may execute code; this is not UI business validation or a storage backup.";
  server.registerTool(
    "wshcm_list_object_types",
    {
      description:
        "List HCM document types and catalog forms, including registered cc_* types. Catalog entries report their native objectType (null when HCM declares none). Filter by kind or exact objectType, and page with offset/limit. Object entries can summarize configured custom fields. Match one objectType and set includeCustomFields to read field definitions and template IDs.",
      inputSchema: wshcmSchemas.objects.listTypes,
      annotations: readAnnotations,
    },
    (input) => objectResult(() => api.objects.listTypes(input)),
  );
  server.registerTool(
    "wshcm_get_custom_field_definitions",
    {
      description:
        "Read field and page definitions in their native order, available field type codes, and a revision. Use scope.objectType for common definitions, or scope.objectType and the exact templateId of an existing owner record such as request_type. An unconfigured template returns exists:false. Values on instances are read with wshcm_get_object.",
      inputSchema: wshcmSchemas.customFields.get,
      annotations: readAnnotations,
    },
    (input) => objectResult(() => api.customFields.get(input)),
  );
  server.registerTool(
    "wshcm_patch_custom_field_definitions",
    {
      description:
        "Apply ordered upsert, move or remove operations to one definition scope. Use revision from wshcm_get_custom_field_definitions in this session. dryRun previews without Save. Unspecified settings and other scopes are preserved. Move uses a before or after key. Updating or removing a definition leaves stored object values alone. Any concurrent registry change can cause Conflict. If the write outcome is unknown, reread before trying again.",
      inputSchema: wshcmSchemas.customFields.patch,
      annotations: writeAnnotations,
    },
    (input) => objectResult(() => api.customFields.patch(input)),
  );
  server.registerTool(
    "wshcm_get_form",
    {
      description:
        "Get the loaded, expanded XMD root as XML, with root and actual form URL. Inheritance is resolved by the platform; remaining dependencies/cache freshness are not guaranteed." +
        description,
      inputSchema: wshcmSchemas.objects.getForm,
      annotations: readAnnotations,
    },
    (input) => objectResult(() => api.objects.getForm(input)),
  );
  server.registerTool(
    "wshcm_get_object",
    {
      description:
        "Read a full object XML by exact decimal ID, its actual form URL and a readToken for patch, whole-document replace or deletion. Oversized XML is rejected, not truncated. Tokens belong to this MCP instance and expire after 30 minutes." +
        description,
      inputSchema: wshcmSchemas.objects.get,
      annotations: readAnnotations,
    },
    (input) => objectResult(() => api.objects.get(input)),
  );
  server.registerTool(
    "wshcm_save_object",
    {
      description:
        "Create or fully replace ONE object using XML. Create requires formUrl and no ID; replace requires id/readToken from a full read and uses the object's actual form. Omitted fields are removed on replace. Checks syntax, root, identity, known paths, singleton cardinality and integer lexical/range. Other types use native conversion; no full business validation. A replace attempt consumes the token. Compare-before-save is not atomic CAS. Save/hooks can partially succeed; inspect writeStatus and known ID, never blindly retry." +
        description,
      inputSchema: wshcmSchemas.objects.save,
      annotations: writeAnnotations,
    },
    (input) => objectResult(() => api.objects.save(input)),
  );
  server.registerTool(
    "wshcm_patch_object",
    {
      description:
        "Apply a partial XML edit to an existing object by exact decimal ID and a fresh full-read token. Omitted fields are preserved. Arrays merge by key or replace the unkeyed group; bt-mode supports explicit replace, replace-array, clear and remove where applicable. Each handled attempt consumes the token, including dryRun, invalid XML and no-op. dryRun returns the candidate XML without Save; no-op skips Save. A changed apply returns saved readback and hooks can affect that XML. Establish the outcome before retrying an uncertain write." +
        description,
      inputSchema: wshcmSchemas.objects.patch,
      annotations: writeAnnotations,
    },
    (input) => objectResult(() => api.objects.patch(input)),
  );
  server.registerTool(
    "wshcm_delete_object",
    {
      description:
        "Move one HCM document to the platform trash by exact ID. Requires a fresh full-read token and matching XML and form snapshot. The comparison is not atomic. The native deletion acknowledgement does not verify related data, UI cleanup or binary cleanup. A handled attempt consumes the token. If the response is lost, establish the outcome before retrying.",
      inputSchema: wshcmSchemas.objects.delete,
      annotations: writeAnnotations,
    },
    (input) => objectResult(() => api.objects.delete(input)),
  );
}
