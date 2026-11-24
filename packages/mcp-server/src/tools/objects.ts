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
    " Form loading and hooks may execute code. The XML API has no file DLL dependency, atomic compare-and-save or UI workflow guarantee.";
  const xmlOutput =
    " Use outputMode:'file' for a temporary UTF-8 XML file in shared/objects (24h), or outputPath for a new .xml in the project. Returns file.path in file mode. Relative paths require one project root.";
  const xmlInput = " Supply exactly one of xml or inputPath. A file input defaults to file output. Set outputMode:'inline' for XML text.";
  server.registerTool(
    "wshcm_list_object_types",
    {
      description:
        "Find registered HCM document types and catalog forms, including cc_* types. Filter by kind or exact objectType. items are paged by offset/limit (default 100, max 250). Check sources for an unavailable registry. Use formUrl with wshcm_get_form and the catalog name with wshcm_xquery. supportsCustomFields reports the XMD container. Discover configured templates with wshcm_get_custom_field_definitions.",
      inputSchema: wshcmSchemas.objects.listTypes,
      annotations: readAnnotations,
    },
    (input) => objectResult(() => api.objects.listTypes(input)),
  );
  server.registerTool(
    "wshcm_list_object_data_types",
    {
      description:
        "Page through definitions in object_data_types (default 100, max 250). Call with {} for all, or supply objectType to match either side. primaryObjectType and secondaryObjectType constrain specific sides. All filters must match. items include exact decimal id, code, name and both sides (null when unset). Query object_datas by object_data_type_id for stored records. Use id as scope.templateId with scope.objectType='object_data_type' to read its configured fields.",
      inputSchema: wshcmSchemas.objects.listDataTypes,
      annotations: readAnnotations,
    },
    (input) => objectResult(() => api.objects.listDataTypes(input)),
  );
  server.registerTool(
    "wshcm_get_custom_field_definitions",
    {
      description:
        "Find registered custom-field templates with {mode:'list',objectType,offset?,limit?}. Returns common counts, templates, templateType and templateSelector (e.g. request_type_id on request). To read definitions pass {scope} instead: objectType alone for common fields, or the returned templateType and exact templateId for one owner. Only a scope read returns ordered fields/pages, fieldTypes, exists and revision for patching. Read instance values with wshcm_get_object.",
      inputSchema: wshcmSchemas.customFields.lookup,
      annotations: readAnnotations,
    },
    (input) =>
      objectResult(() => {
        if ("scope" in input) return api.customFields.get(input);
        const { mode: _, ...list } = input;
        return api.customFields.list(list);
      }),
  );
  server.registerTool(
    "wshcm_patch_custom_field_definitions",
    {
      description:
        "Apply 1\u2013100 ordered operations to a definition scope using its revision from wshcm_get_custom_field_definitions. Upsert creates or edits in place, move uses before/after, renameField changes a key, removeTemplate deletes the configured template. Omitted properties are preserved. Use null for clearable text/page access and [] for options or visibilityConditions. dryRun returns candidate fields/pages and changed without Save. A saved edit returns a fresh revision. Editing page access or removing a restricted page/template requires HCM admin. Migrate stored values separately via wshcm_patch_object. Reread the scope after a conflict or unknown outcome.",
      inputSchema: wshcmSchemas.customFields.patch,
      annotations: writeAnnotations,
    },
    (input) => objectResult(() => api.customFields.patch(input)),
  );
  server.registerTool(
    "wshcm_get_form",
    {
      description:
        "Read the loaded XMD by formUrl from wshcm_list_object_types or wshcm_get_object. Returns formUrl, root and expanded schema in xml for inspecting paths, types and array keys. Platform inheritance is resolved at load time. Dependencies and cache freshness are platform-specific. Use wshcm_get_custom_field_definitions for configured fields and pages." +
        xmlOutput +
        description,
      inputSchema: wshcmSchemas.objects.getForm,
      annotations: { ...readAnnotations, readOnlyHint: false },
    },
    (input) => objectResult(() => api.objects.getForm(input)),
  );
  server.registerTool(
    "wshcm_get_object",
    {
      description:
        "Open one HCM document by exact decimal id. Returns id, formUrl, root, full exported xml and a fresh readToken for wshcm_patch_object, full replacement or deletion. XML or schema over 256 KiB is rejected whole. A new read of this id replaces its token in this MCP instance. Tokens expire after 30 minutes." +
        xmlOutput +
        description,
      inputSchema: wshcmSchemas.objects.get,
      annotations: { ...readAnnotations, readOnlyHint: false },
    },
    (input) => objectResult(() => api.objects.get(input)),
  );
  server.registerTool(
    "wshcm_save_object",
    {
      description:
        "Create a document with {mode:'create',formUrl,xml}, or fully replace one with {mode:'replace',id,readToken,xml} from a complete read. Omitted fields are removed or reset on replace. For partial changes use wshcm_patch_object. Checks XML syntax, root/identity, known fields, cardinality and integer range. Success returns the id and saved XML readback. A handled replace consumes the token. Check writeStatus and known id on errors: saved can accompany a failed readback, unknown needs an independent check before retry." +
        xmlInput +
        xmlOutput +
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
        "Patch fields of one existing document with {id,readToken,xml,dryRun?} from a fresh wshcm_get_object read. Omitted fields are preserved. Keyed arrays merge by primary key; supplying an unkeyed group replaces all its entries. bt-mode supports replace, replace-array, clear and keyed remove. Every handled attempt consumes the token, including dryRun, invalid XML and no-op. Preview returns changed and candidate xml. Reread before apply. No-op skips Save. Saved xml reflects readback after hooks. Verify uncertain writes before retry." +
        xmlInput +
        xmlOutput +
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
        "Move one document to the HCM trash using {id,readToken} from wshcm_get_object. A handled attempt consumes the token and rechecks the XML and form before native deletion. Success returns id, mode:'trash', deleteStatus:'deleted'. This acknowledges the native call. Related records and binary cleanup depend on HCM. If deleteStatus is unknown, check the catalog and trash before a new attempt.",
      inputSchema: wshcmSchemas.objects.delete,
      annotations: writeAnnotations,
    },
    (input) => objectResult(() => api.objects.delete(input)),
  );
}
