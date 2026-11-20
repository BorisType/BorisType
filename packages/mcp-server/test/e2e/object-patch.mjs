import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { WshcmApi } from "@boristype/ws-client";
import { buildScript } from "../../../ws-client/build/hcm/load.js";
import { inspectObjectXml } from "../../../ws-client/build/hcm/object-xml.js";
import { sha256, withStand } from "../../../../refs/research/mcp/object-patch/stand.mjs";

const root = new URL("../../../../", import.meta.url);
const formUrl = "x-local://wtv/wtv_cost_center.xmd";
const xml = (body) => "<cost_center>" + body + "</cost_center>";
const beforeSave = (body, id) => {
  assert.equal(body.id, id);
  assert.equal(body.writeStatus, "not_attempted");
};

async function fileHashes(files) {
  const entries = await Promise.all(files.map(async (path) => [path, sha256(await readFile(new URL(path, root)))]));
  return Object.fromEntries(entries);
}

test("partial XML patch through built CLI, stdio and native SOAP", { timeout: 180_000 }, async (t) => {
  const sourcePaths = [
    "packages/ws-client/package.json",
    "packages/ws-client/resources/object-operation.bs",
    "packages/ws-client/resources/object-patch.bs",
    "packages/ws-client/src/hcm/api.ts",
    "packages/ws-client/src/hcm/load.ts",
    "packages/ws-client/src/hcm/objects.ts",
    "packages/ws-client/src/hcm/object-error.ts",
    "packages/ws-client/src/hcm/object-state.ts",
    "packages/ws-client/src/hcm/object-xml.ts",
    "packages/ws-client/src/hcm/schemas.ts",
    "packages/mcp-server/package.json",
    "packages/mcp-server/src/cli.ts",
    "packages/mcp-server/src/connection.ts",
    "packages/mcp-server/src/server.ts",
    "packages/mcp-server/src/tools/objects.ts",
    "packages/mcp-server/test/e2e/object-patch.mjs",
    "refs/research/mcp/object-patch/stand.mjs",
  ];
  const sourceFiles = await fileHashes(sourcePaths);
  const builtFiles = await fileHashes(
    sourcePaths.filter((path) => path.includes("/src/")).map((path) => path.replace("/src/", "/build/").replace(/\.ts$/, ".js")),
  );
  const receipt = await withStand(async (ev, record) => {
    const client = new Client({ name: "boristype-object-patch-e2e", version: "1.0.0" }, { supportedProtocolVersions: ["2025-11-25"] });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("packages/mcp-server/build/cli.js", root))],
      env: {
        NODE_USE_ENV_PROXY: "0",
        WSHCM_HOST: process.env.WSHCM_HOST ?? "localhost",
        WSHCM_PORT: process.env.WSHCM_PORT ?? "80",
        WSHCM_USERNAME: process.env.WSHCM_USERNAME,
        WSHCM_PASSWORD: process.env.WSHCM_PASSWORD,
        WSHCM_HTTPS: "false",
      },
      stderr: "pipe",
    });
    const protocolErrors = [];
    client.onerror = (error) => protocolErrors.push(error);
    transport.stderr.resume();
    const api = new WshcmApi(ev);
    const code = "bt-mcp-patch-" + record.marker;
    const query = "for $c in cost_centers where $c/code = '" + code + "' return $c";
    const owned = async () =>
      JSON.parse(
        await ev.eval(
          buildScript("var ids=[];var c;for(c in XQuery('${query}')) ids.push(StrInt(c.id));return EncodeJson(ids);", { query }),
        ),
      );
    const packageXml = () => ev.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.Xml;");
    let baseline;
    let createAttempted = false;
    let id;
    const call = async (name, args, expectError = false) => {
      const response = await client.callTool({ name: "wshcm_" + name, arguments: args }, { timeout: 35_000 });
      const body = JSON.parse(response.content[0].text);
      if (name === "save_object" && body.id) id = body.id;
      assert.equal(response.isError === true, expectError, JSON.stringify(body));
      return body;
    };
    const get = () => call("get_object", { id });
    const patch = (read, body, expectError = false, dryRun = false) =>
      call("patch_object", { id, readToken: read.readToken, xml: xml(body), dryRun }, expectError);
    const tokenRequired = async (read) => {
      const result = await patch(read, "", true);
      beforeSave(result, id);
      assert.equal(result.phase, "input");
      assert.match(result.error.message, /ReadRequired/);
    };
    try {
      baseline = await packageXml();
      assert.deepEqual(await owned(), []);
      await client.connect(transport, { timeout: 35_000 });
      const { tools } = await client.listTools();
      assert.equal(tools.length, 32);
      assert.ok(tools.some(({ name }) => name === "wshcm_patch_object"));
      record.protocol = {
        carrier: "built CLI / JSON-RPC stdio / SP-XML SOAP / Linux C-runtime",
        tools: tools.length,
        ...client.getServerVersion(),
      };

      createAttempted = true;
      const created = await call("save_object", {
        mode: "create",
        formUrl,
        xml: xml(
          "<code>" +
            code +
            "</code><name>initial</name><comment>keep-comment</comment>" +
            "<custom_elems><custom_elem><name>alpha</name><value>retained</value></custom_elem></custom_elems>",
        ),
      });
      assert.match(id, /^[1-9]\d{0,19}$/);
      assert.equal(created.writeStatus, "saved");
      assert.deepEqual(await owned(), [id]);
      record.fixture = { id, code, formUrl };

      const initial = await get();
      assert.equal(initial.id, id);
      assert.equal(initial.formUrl, formUrl);
      assert.equal(initial.xml, created.xml);
      const update =
        "<name>Привет &amp; changed</name><custom_elems><custom_elem><name>beta</name><value>added</value></custom_elem></custom_elems>";
      const saved = await patch(initial, update);
      assert.deepEqual(saved, { id, formUrl, root: "cost_center", xml: saved.xml, changed: true, dryRun: false, writeStatus: "saved" });
      assert.match(saved.xml, /<name>Привет &amp; changed<\/name>/);
      assert.match(saved.xml, /<comment>keep-comment<\/comment>/);
      assert.match(saved.xml, /<name>alpha<\/name>\s*<value>retained<\/value>/);
      assert.match(saved.xml, /<name>beta<\/name>\s*<value>added<\/value>/);
      assert.ok(saved.xml.includes("<code>" + code + "</code>"));
      assert.doesNotMatch(saved.xml, /bt-mode=/);
      await tokenRequired(initial);

      const reopened = await get();
      assert.equal(reopened.xml, saved.xml);
      await delay(1100); // A Save would have a different modification second on this stand.
      const repeated = await patch(reopened, update);
      assert.deepEqual(repeated, { ...saved, changed: false, writeStatus: "not_attempted" });
      await tokenRequired(reopened);
      const afterNoop = await get();
      assert.equal(afterNoop.xml, saved.xml);

      const preview = await patch(afterNoop, "<name>preview-only</name>", false, true);
      assert.deepEqual(preview, { ...saved, xml: preview.xml, dryRun: true, writeStatus: "not_attempted" });
      assert.match(preview.xml, /<name>preview-only<\/name>/);
      await tokenRequired(afterNoop);
      assert.equal((await get()).xml, saved.xml);

      const clock = inspectObjectXml(saved.xml, { id, formUrl }).nodes.find(
        (node) => node.path.join("/") === "doc_info/modification/date",
      )?.text;
      assert.ok(clock, "fixture has a native modification clock");
      const copied = await patch(await get(), "<doc_info><modification><date>" + clock + "</date></modification></doc_info>");
      assert.deepEqual(copied, repeated);

      const invalidModes = [];
      for (const body of ['<name bt-mode="remove"/>', '<name bt-mode="MERGE"/>']) {
        const read = await get();
        const rejected = await patch(read, body, true);
        beforeSave(rejected, id);
        invalidModes.push({ xml: xml(body), phase: rejected.phase, error: rejected.error.code, writeStatus: rejected.writeStatus });
        await tokenRequired(read);
        assert.equal((await get()).xml, saved.xml);
      }

      const old = await get();
      const independent = await api.objects.get({ id });
      const other = await api.objects.patch({ id, readToken: independent.readToken, xml: xml("<name>independent-change</name>") });
      assert.equal(other.writeStatus, "saved");
      const stale = await patch(old, "<name>stale</name>", true);
      beforeSave(stale, id);
      assert.equal(stale.error.code, "Conflict");
      await tokenRequired(old);
      assert.equal((await get()).xml, other.xml);
      record.outcomes = {
        saved: { changed: saved.changed, writeStatus: saved.writeStatus, xmlSha256: sha256(saved.xml), untouchedFieldsPreserved: true },
        repeat: { changed: repeated.changed, writeStatus: repeated.writeStatus, xmlSha256: sha256(repeated.xml) },
        preview: { changed: preview.changed, dryRun: preview.dryRun, writeStatus: preview.writeStatus, storedXmlUnchanged: true },
        copyNativeClock: { clock, changed: copied.changed, writeStatus: copied.writeStatus },
        invalidModes,
        conflict: { code: stale.error.code, phase: stale.phase, writeStatus: stale.writeStatus, storedXmlSha256: sha256(other.xml) },
        attemptedTokensConsumed: true,
      };
    } finally {
      try {
        await client.close();
      } finally {
        if (createAttempted) {
          // The exact marker also identifies the fixture if the create response was lost.
          const ids = new Set([...(await owned()), ...(id ? [id] : [])]);
          record.cleanup.objects = [];
          for (const fixture of ids) {
            assert.match(fixture, /^[1-9]\d{0,19}$/);
            const state = JSON.parse(
              await ev.eval(
                buildScript(
                  "var id=Int('${id}');var u=UrlFromDocID(id);var d=OpenDoc(u);" +
                    "if(StrInt(d.DocID) != '${id}' || String(d.TopElem.code.Value) != '${code}') throw 'fixture identity mismatch';" +
                    "DeleteDoc(u,true);var opened=false;try {OpenDoc(u);opened=true;} catch(e) {}" +
                    "return EncodeJson({id:StrInt(id),opened:opened,rows:ArrayCount(XQuery('for $c in cost_centers where $c/id = ${id} return $c'))," +
                    "trash:ArrayCount(XQuery('for $t in trash_docs where $t/id = ${id} return $t'))});",
                  { id: fixture, code },
                ),
              ),
            );
            assert.deepEqual(state, { id: fixture, opened: false, rows: 0, trash: 0 });
            record.cleanup.objects.push(state);
          }
          assert.deepEqual(await owned(), []);
          record.cleanup.ownedMarkerAbsent = true;
        }
        if (baseline !== undefined) {
          const after = await packageXml();
          assert.equal(after, baseline);
          record.cleanup.packageSchema = { beforeSha256: sha256(baseline), afterSha256: sha256(after) };
        }
      }
    }
    assert.deepEqual(protocolErrors, []);
    record.protocol.errors = protocolErrors.length;
  });
  assert.deepEqual(await fileHashes(sourcePaths), sourceFiles);
  assert.deepEqual(await fileHashes(Object.keys(builtFiles)), builtFiles);
  Object.assign(receipt, { node: process.version, sourceFiles, builtFiles });
  if (process.env.WSHCM_MCP_PATCH_RECEIPT) await writeFile(process.env.WSHCM_MCP_PATCH_RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  t.diagnostic(JSON.stringify({ platform: receipt.version, fixture: receipt.fixture, cleanup: receipt.cleanup }));
});
