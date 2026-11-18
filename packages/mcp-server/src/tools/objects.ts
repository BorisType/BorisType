import type { McpServer } from "@modelcontextprotocol/server";
import { wshcmSchemas, WshcmObjectError, type WshcmApi } from "@boristype/ws-client";

function output(body: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(body) }], ...(isError ? { isError: true } : {}) };
}
async function objectResult(action: () => Promise<unknown>) {
  try {
    return output(await action());
  } catch (error) {
    if (error instanceof WshcmObjectError) return output(error.details, true);
    throw error;
  }
}

export function registerObjectTools(server: McpServer, api: WshcmApi): void {
  const readAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true };
  const writeAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
  const description =
    " Uses platform XML API without a DLL. Form loading and initialization may execute code; this is not UI business validation or a storage backup.";
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
        "Read a full object XML by exact decimal ID, its actual form URL and a readToken for patch or whole-document replace. Oversized XML is rejected, not truncated. Tokens belong to this MCP instance and expire after 30 minutes." +
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
}
