// Opt-in acceptance on an exclusive, already-running Linux HCM stand.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { PackageArtifactStore } from "../../../ws-client/build/hcm/packages/artifacts.js";
import { cleanupPackageFixtures } from "../../../ws-client/test/helpers/package-native-cleanup.mjs";
import { sha256, withStand } from "../../../../refs/research/mcp/object-patch/stand.mjs";
import { openRecoveryProxy } from "./connection-recovery-proxy.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const schemaXml = "return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.GetXml();";
const formUrl = "x-local://wtv/wtv_cost_center.xmd";
const xml = (body) => "<cost_center>" + body + "</cost_center>";
const proxyPort = (url) => Number(new URL(url).port);

async function hashes(paths) {
  return Object.fromEntries(await Promise.all(paths.sort().map(async (path) => [path, sha256(await readFile(join(root, path)))])));
}

async function buildFiles(packageName) {
  const directory = `packages/${packageName}/build`;
  return (await readdir(join(root, directory), { recursive: true }))
    .filter((path) => path.endsWith(".js"))
    .map((path) => `${directory}/${path}`);
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 10_000 }).trim();
}

function openStand() {
  const container = process.env.WSHCM_CONTAINER ?? "boristype-c-runtime-net9-wt-1";
  assert.match(container, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
  const docker = (...args) => execFileSync("docker", args, { timeout: 10_000, maxBuffer: 1024 * 1024 });
  const exec = (...args) => docker("exec", container, ...args);
  const wt = "/WebsoftServer/wt";
  const inspect = () =>
    JSON.parse(
      docker(
        "inspect",
        "--format",
        '{"running":{{.State.Running}},"startedAt":{{json .State.StartedAt}},"restartCount":{{.RestartCount}},"image":{{json .Config.Image}}}',
        container,
      ),
    );
  assert.equal(inspect().running, true, "Use an already-running exclusive local stand");
  const upstream = new URL(`http://${process.env.WSHCM_HOST ?? "localhost"}:${process.env.WSHCM_PORT ?? "80"}`);
  assert.ok(["localhost", "127.0.0.1"].includes(upstream.hostname), "Use the published loopback HTTP port of the selected container");
  const ports = JSON.parse(docker("inspect", "--format", "{{json .NetworkSettings.Ports}}", container));
  assert.ok(
    ports["80/tcp"]?.some(({ HostIp, HostPort }) => ["0.0.0.0", "127.0.0.1"].includes(HostIp) && HostPort === (upstream.port || "80")),
    "Container port 80 must be published to the selected local port",
  );
  return {
    upstream,
    exec,
    inspect,
    helperBytes: (name) => exec("cat", "--", `${wt}/${name}`),
    removeHelper: (name) => exec("rm", "--", `${wt}/${name}`),
    inventory: () =>
      exec("find", wt, "-maxdepth", "1", "-type", "f", "-name", "unsafe_eval_*.bs", "-printf", "%f\n")
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean)
        .sort(),
  };
}

// The managed readiness path can install files. Check the exact already-installed bundle and active marker first.
async function installedRuntime(stand) {
  const manifest = JSON.parse(await readFile(join(root, "packages/ws-client/resources/dotnet/manifest.json"), "utf8"));
  const { bootstrap, component } = manifest;
  const shared = "/WebsoftServer/dotnetcore/shared/.boristype-runtime";
  const runtime = [
    ...bootstrap.files.map((file) => [`${shared}/bootstrap/${bootstrap.id}/${file.path}`, file.sha256]),
    ...component.files.map((file) => [
      `${shared}/components/${component.id}/${component.version}-${component.buildId}/${file.path}`,
      file.sha256,
    ]),
  ];
  const marker = `${shared}/components/${component.id}/active.json`;
  const read = () => {
    const bytes = stand.exec("cat", "--", marker);
    return { active: sha256(bytes), files: Object.fromEntries(runtime.map(([path]) => [path, sha256(stand.exec("cat", "--", path))])) };
  };
  try {
    const active = JSON.parse(stand.exec("cat", "--", marker));
    assert.deepEqual(active, {
      ...component,
      identity: { id: component.id, version: component.version, apiVersion: component.apiVersion, buildId: component.buildId },
    });
    const before = read();
    assert.deepEqual(before.files, Object.fromEntries(runtime));
    return { before, read, buildId: component.buildId };
  } catch (error) {
    if (error.status === 1 || error.code === "ERR_ASSERTION") return undefined;
    throw error;
  }
}

test("built MCP keeps one stdio session across native HCM outages", { timeout: 180_000 }, async (t) => {
  assert.ok(process.env.WSHCM_USERNAME && process.env.WSHCM_PASSWORD, "Set WSHCM_USERNAME and WSHCM_PASSWORD");
  assert.notEqual(process.env.WSHCM_HTTPS, "true", "The owned proxy uses HTTP");
  const stand = openStand();
  const platform = stand.inspect();
  const evaluatorBaseline = stand.inventory();
  let privateDirectory;
  const cleanArtifacts = async () => {
    if (!privateDirectory) return;
    await rm(privateDirectory, { recursive: true, force: true });
    await assert.rejects(access(privateDirectory), { code: "ENOENT" });
    privateDirectory = undefined;
  };
  t.after(cleanArtifacts);
  privateDirectory = await mkdtemp(join(tmpdir(), "boristype-recovery-artifacts-"));
  const artifactsDirectory = privateDirectory;
  const runtime = await installedRuntime(stand);
  const sourcePaths = [
    ...git("ls-files", "--", "packages/ws-client/src", "packages/ws-client/resources", "packages/mcp-server/src").split("\n"),
    "pnpm-lock.yaml",
    "packages/ws-client/resources/dotnet/manifest.json",
    "packages/ws-client/package.json",
    "packages/mcp-server/package.json",
    "packages/mcp-server/test/e2e/connection-recovery.mjs",
    "packages/mcp-server/test/e2e/connection-recovery-proxy.mjs",
    "packages/ws-client/test/helpers/package-native-cleanup.mjs",
    "refs/research/mcp/object-patch/stand.mjs",
  ];
  const sourceFiles = await hashes(sourcePaths);
  const builtFiles = await hashes([...(await buildFiles("ws-client")), ...(await buildFiles("mcp-server"))]);
  const receipt = await withStand(async (ev, record) => {
    record.platform = { ...platform, kernel: stand.exec("uname", "-srm").toString().trim() };
    record.nativeAccountId = await ev.eval("return StrInt(tools.get_cur_user_id());");
    const baseline = await ev.eval(schemaXml);
    const beforeCli = stand.inventory();
    const marker = "bt-packages-" + record.marker;
    const operations = [];
    const artifactStore = new PackageArtifactStore(artifactsDirectory);
    const query = `for $c in cost_centers where $c/code = "${marker}" return $c`;
    const ownedObjects = async () =>
      JSON.parse(await ev.eval(`var ids=[];var c;for(c in XQuery('${query}')) ids.push(StrInt(c.id));return EncodeJson(ids);`));
    const operationId = () => {
      const id = randomUUID();
      operations.push(id);
      return id;
    };
    const proxy = await openRecoveryProxy(stand.upstream, beforeCli);
    const client = new Client({ name: "mcp-native-recovery", version: "1" }, { supportedProtocolVersions: ["2025-11-25"] });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        join(root, "packages/mcp-server/build/cli.js"),
        "--package-artifact-directory",
        artifactsDirectory,
        "--shared-directory",
        join(privateDirectory, "export"),
      ],
      env: {
        NODE_USE_ENV_PROXY: "0",
        WSHCM_HOST: "127.0.0.1",
        WSHCM_PORT: String(proxyPort(proxy.url)),
        WSHCM_USERNAME: process.env.WSHCM_USERNAME,
        WSHCM_PASSWORD: process.env.WSHCM_PASSWORD,
        WSHCM_HTTPS: "false",
      },
      stderr: "pipe",
    });
    let stderrBytes = 0;
    let protocolErrors = 0;
    transport.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
    });
    client.onerror = () => {
      protocolErrors++;
    };
    let helper;
    let testFailure;
    let fixtureAttempted = false;
    const fixture = {
      mode: "create",
      formUrl,
      xml: xml(
        `<code>${marker}</code><name>initial</name><comment>keep-comment</comment>` +
          "<custom_elems><custom_elem><name>alpha</name><value>retained</value></custom_elem></custom_elems>",
      ),
    };
    const call = async (name, args = {}, error = false) => {
      const response = await client.callTool({ name: "wshcm_" + name, arguments: args }, { timeout: 35_000 });
      assert.equal(response.content.length, 1);
      const body = JSON.parse(response.content[0].text);
      if (body.artifact) {
        const { artifactId, localPath } = body.artifact;
        assert.match(artifactId, /^[a-f0-9-]{36}$/);
        assert.equal(localPath, join(artifactsDirectory, artifactId + ".zip"));
      }
      assert.equal(response.isError === true, error, JSON.stringify(body));
      return body;
    };
    const execute = (code, error) => call("execute", { code }, error);
    const connectionError = (body, state, statusCode) => {
      const auth = state === "authentication";
      assert.equal(body.error.code, auth ? "HcmAuthenticationFailed" : "HcmUnavailable");
      assert.equal(body.connection.state, state);
      assert.equal(body.connection.retryable, !auth);
      assert.deepEqual(body.connection.target, { host: "127.0.0.1", port: proxyPort(proxy.url), https: false });
      assert.equal(body.connection.statusCode, statusCode);
      assert.ok(body.error.message);
      assert.doesNotMatch(JSON.stringify(body), /proxy-private-error-body|authorization|set-cookie|cookie/i);
      return { code: body.error.code, state, statusCode, retryable: body.connection.retryable };
    };
    const mark = () => proxy.exchanges.length;
    const wireSince = (index) => proxy.exchanges.slice(index).map((entry) => entry.kind);
    try {
      assert.deepEqual(await ownedObjects(), []);
      await client.connect(transport, { timeout: 5000 });
      const pid = transport.pid;
      assert.ok(pid);
      const { tools } = await client.listTools({}, { timeout: 5000 });
      assert.equal(tools.length, 33);
      const toolNames = tools.map(({ name }) => name).sort();
      assert.deepEqual(await client.ping({ timeout: 5000 }), {});
      assert.equal(mark(), 0);
      assert.deepEqual(stand.inventory(), beforeCli);
      record.startup = { ...client.getServerVersion(), toolCount: tools.length, toolNames, ping: "ok", httpRequests: mark(), pid };

      const offline = await execute("return 7;", true);
      assert.equal(offline.executionStatus, "not_started");
      record.firstOffline = { ...connectionError(offline, "http", 503), executionStatus: offline.executionStatus };
      assert.deepEqual(wireSince(0), ["login"]);
      fixtureAttempted = true;
      const rejectedWrite = await call("save_object", fixture, true);
      assert.equal(rejectedWrite.writeStatus, "not_attempted");
      assert.deepEqual(wireSince(0), ["login", "login"]);
      record.firstOffline.writeStatus = rejectedWrite.writeStatus;
      record.authentication = [];
      for (const status of [401, 403]) {
        const start = mark();
        proxy.mode = status;
        const rejected = await execute("return 7;", true);
        assert.equal(rejected.executionStatus, "not_started");
        record.authentication.push(connectionError(rejected, "authentication", status));
        assert.deepEqual(wireSince(start), ["login"]);
      }

      proxy.mode = "online";
      proxy.next = { kind: "upload", action: "drop-response" };
      const uploadStart = mark();
      const firstSetup = await execute("return 7;", true);
      assert.equal(firstSetup.executionStatus, "not_started");
      assert.deepEqual(wireSince(uploadStart), ["login", "upload"]);
      const upload = proxy.exchanges.at(-1);
      assert.equal(upload.delivery, "drop-response");
      assert.equal(upload.upstreamStatus, 200);
      helper = upload.helper;
      assert.deepEqual(stand.inventory(), [...beforeCli, helper].sort());
      const helperSha256 = sha256(stand.helperBytes(helper));
      assert.ok(helperSha256);
      record.ambiguousSetup = {
        helper,
        helperSha256,
        ...connectionError(firstSetup, "network"),
        executionStatus: firstSetup.executionStatus,
      };

      const recovered = mark();
      const values = await Promise.all([execute("return 7;"), execute("return 8;")]);
      assert.deepEqual(
        values.map(({ value }) => value),
        [7, 8],
      );
      assert.deepEqual(wireSince(recovered), ["login", "probe", "business", "business"]);
      record.concurrentRecovery = { values: values.map(({ value }) => value), wire: wireSince(recovered) };

      const broken = await execute('throw "owned recovery script failure";', true);
      assert.match(broken.error.message, /owned recovery script failure/);
      assert.equal(broken.connection, undefined);
      record.businessFailure = { phase: broken.error.phase, connectionDiagnostic: false };

      const schemas = await call("list_package_schemas");
      record.baselineSchemas = schemas.items.map(({ schemaId, name, objectCount }) => ({ schemaId, name, objectCount }));
      const system = await call("get_system_info");
      record.system = system.summary;

      const created = await call("save_object", fixture);
      const { id } = created;
      assert.match(id, /^[1-9]\d{0,19}$/);
      assert.equal(created.writeStatus, "saved");
      assert.deepEqual(await ownedObjects(), [id]);
      record.fixture = { id, code: marker, formUrl };

      const read = await call("get_object", { id });
      const exportId = operationId();
      const exported = await call("export_package", { objectIds: [id], operationId: exportId });
      assert.equal(exported.status, "completed");
      assert.equal(exported.operationId, exportId);
      assert.equal(exported.objects.total, 1);
      const previewId = operationId();
      const preview = await call("inspect_package", { artifactId: exported.artifact.artifactId, operationId: previewId, limit: 1 });
      assert.equal(preview.inspectionId, previewId);
      assert.equal(preview.items[0].kind, "package");
      assert.equal(preview.total, 2);

      proxy.mode = "offline";
      const offlineStart = mark();
      const diskArtifact = await artifactStore.get(exported.artifact.artifactId);
      const zip = await readFile(diskArtifact.localPath);
      assert.deepEqual(diskArtifact, exported.artifact);
      assert.equal(zip.length, diskArtifact.sizeBytes);
      assert.equal(sha256(zip), diskArtifact.sha256);
      assert.equal(mark(), offlineStart);
      const cachedOffline = await call("inspect_package", { inspectionId: previewId, offset: 1 }, true);
      assert.equal(cachedOffline.operationId, previewId);
      assert.equal(cachedOffline.lastKnownOperation.operationId, previewId);
      assert.equal(cachedOffline.lastKnownOperation.status, "completed");
      assert.equal(cachedOffline.status, "unknown");
      record.cachedInspectionOffline = {
        ...connectionError(cachedOffline, "http", 503),
        operationId: cachedOffline.operationId,
        lastKnownStatus: cachedOffline.lastKnownOperation.status,
        status: cachedOffline.status,
      };
      assert.deepEqual(wireSince(offlineStart), ["probe"]);

      const beforeCapture = new Set(await readdir(artifactsDirectory));
      const captureStart = mark();
      const failedInspectionId = operationId();
      const failedCapture = await call("inspect_package", { artifactId: diskArtifact.artifactId, operationId: failedInspectionId }, true);
      assert.equal(failedCapture.operationId, failedInspectionId);
      assert.equal(failedCapture.artifact, undefined);
      assert.equal(failedCapture.artifactId, undefined);
      const unacknowledgedFailure = connectionError(failedCapture, "http", 503);
      assert.deepEqual(wireSince(captureStart), ["login"]);
      const newFiles = (await readdir(artifactsDirectory)).filter((file) => !beforeCapture.has(file)).sort();
      assert.equal(newFiles.length, 2);
      const [metadataPath, zipPath] = newFiles;
      assert.match(metadataPath, /^[a-f0-9-]{36}\.json$/);
      const unacknowledgedId = metadataPath.slice(0, -5);
      assert.equal(zipPath, unacknowledgedId + ".zip");
      const unacknowledged = await artifactStore.get(unacknowledgedId);
      assert.equal(unacknowledged.sha256, diskArtifact.sha256);
      assert.deepEqual(await readFile(unacknowledged.localPath), zip);
      record.unacknowledgedArtifact = {
        artifactIdFromStore: unacknowledgedId,
        toolReturnedArtifactId: false,
        files: newFiles,
        operationId: failedInspectionId,
        ...unacknowledgedFailure,
      };
      proxy.mode = "online";

      const startRepair = mark();
      await ev.eval(`DeleteFile('x-local://wt/${helper}');return;`);
      assert.deepEqual(stand.inventory(), beforeCli);
      assert.equal((await execute("return 9;")).value, 9);
      const observed = wireSince(startRepair);
      const nativeRepair = observed.includes("upload");
      if (!nativeRepair) {
        assert.deepEqual(observed, ["login", "probe", "business"]);
        assert.deepEqual(stand.inventory(), beforeCli, "Native cached execution did not restore the deleted file");
        proxy.next = { kind: "probe", action: "missing-module" };
        const injected = mark();
        assert.equal((await execute("return 10;")).value, 10);
        assert.deepEqual(wireSince(injected), ["probe", "upload", "probe", "business"]);
      } else {
        assert.deepEqual(observed, ["login", "probe", "upload", "probe", "business"]);
      }
      const repair = proxy.exchanges.slice(startRepair).filter((entry) => entry.kind === "upload");
      assert.equal(repair.length, 1);
      assert.equal(repair[0].upstreamStatus, 200);
      assert.equal(repair[0].helper, helper);
      assert.equal(repair[0].requestSha256, upload.requestSha256);
      assert.equal(sha256(stand.helperBytes(helper)), helperSha256);
      assert.deepEqual(stand.inventory(), [...beforeCli, helper].sort());
      record.helperRepair = {
        trigger: nativeRepair ? "native probe after own file deletion" : "one-shot proxy SOAP Fault before dispatch",
        executedWithFileAbsent: !nativeRepair,
        wire: wireSince(startRepair),
        helperSha256,
      };

      const patched = await call("patch_object", { id, readToken: read.readToken, xml: xml("<name>after-reconnect</name>") });
      assert.equal(patched.writeStatus, "saved");
      assert.match(patched.xml, /<name>after-reconnect<\/name>/);
      assert.match(patched.xml, /<comment>keep-comment<\/comment>/);
      assert.match(patched.xml, /<name>alpha<\/name>\s*<value>retained<\/value>/);
      record.readGrant = { id, writeStatus: patched.writeStatus, xmlSha256: sha256(patched.xml), untouchedFieldsPreserved: true };

      const page = await call("inspect_package", { inspectionId: previewId, offset: 1 });
      assert.equal(page.inspectionId, previewId);
      assert.deepEqual(
        page.items.map((item) => item.id),
        [id],
      );
      const status = await call("get_package_operation", { operationId: exportId });
      assert.equal(status.operationId, exportId);
      assert.equal(status.status, "completed");
      assert.deepEqual(status.artifact, diskArtifact);
      const secondPreview = await call("inspect_package", { artifactId: diskArtifact.artifactId, operationId: operationId() });
      assert.deepEqual(
        secondPreview.items.map((item) => item.kind),
        ["package", "object"],
      );
      assert.equal(secondPreview.items[1].id, id);
      assert.equal(secondPreview.artifact.sha256, diskArtifact.sha256);
      record.packageContinuity = {
        artifactId: diskArtifact.artifactId,
        sha256: diskArtifact.sha256,
        bytes: zip.length,
        inspectionId: page.inspectionId,
        operationId: status.operationId,
        newInspectionId: secondPreview.inspectionId,
        operationStatus: status.status,
      };

      if (runtime) {
        const status = await call("runtime_status");
        assert.ok(["ready", "restart_required"].includes(status.status), JSON.stringify(status));
        if (status.status === "ready") {
          assert.equal(status.loaded.buildId, runtime.buildId);
          const file = await call("read_file", { path: `x-local://wt/${helper}` });
          assert.match(file.content, /function drop_self\(\)/);
          assert.equal(file.sha256, helperSha256);
          record.managedFile = { sha256: file.sha256, readTokenIssued: Boolean(file.readToken) };
          assert.equal(record.managedFile.readTokenIssued, true);
        }
        assert.deepEqual(runtime.read(), runtime.before);
        record.runtime = {
          readiness: status.status,
          response: status,
          installedFilesUnchanged: true,
          installedSha256: runtime.before.files,
          activeSha256: runtime.before.active,
        };
      } else {
        record.runtime = { readiness: "skipped", reason: "Exact packaged bootstrap and active component not already present" };
      }

      proxy.next = { kind: "business", action: "drop-response" };
      const beforeMutation = mark();
      const lost = await execute(
        `var d=OpenDoc(UrlFromDocID(Int('${id}')));if(String(d.TopElem.code.Value)!='${marker}') throw 'not owned';` +
          "d.TopElem.name=String(d.TopElem.name.Value)+'-once';d.Save();return String(d.TopElem.name.Value);",
        true,
      );
      assert.equal(lost.executionStatus, "unknown");
      assert.deepEqual(wireSince(beforeMutation), ["probe", "business"]);
      const mutation = proxy.exchanges.at(-1);
      assert.equal(mutation.delivery, "drop-response");
      assert.equal(mutation.upstreamStatus, 200);
      const { name: nativeName } = JSON.parse(
        await ev.eval(`var d=OpenDoc(UrlFromDocID(Int('${id}')));return EncodeJson({name:String(d.TopElem.name)});`),
      );
      assert.equal(nativeName, "after-reconnect-once");
      assert.match((await call("get_object", { id })).xml, /<name>after-reconnect-once<\/name>/);
      const dispatches = proxy.exchanges.filter(({ requestSha256 }) => requestSha256 === mutation.requestSha256).length;
      assert.equal(dispatches, 1);
      assert.equal(transport.pid, pid);
      assert.deepEqual((await client.listTools()).tools.map(({ name }) => name).sort(), toolNames);
      assert.deepEqual(await client.ping(), {});
      record.lostMutation = {
        ...connectionError(lost, "network"),
        executionStatus: lost.executionStatus,
        nativeName,
        requestSha256: mutation.requestSha256,
        dispatches,
      };
    } catch (error) {
      testFailure = error;
      throw error;
    } finally {
      const cleanupErrors = [];
      const clean = async (fn) => {
        try {
          await fn();
        } catch (error) {
          cleanupErrors.push(error);
        }
      };
      proxy.mode = "online";
      proxy.next = undefined;
      await clean(async () => {
        const shutdown = mark();
        await client.close();
        assert.deepEqual(wireSince(shutdown), helper ? ["cleanup"] : []);
      });
      await clean(async () => {
        const ownedHelper = proxy.exchanges.find((entry) => entry.kind === "upload")?.helper;
        const inventory = stand.inventory();
        if (ownedHelper && !beforeCli.includes(ownedHelper) && inventory.includes(ownedHelper)) {
          assert.match(ownedHelper, /^unsafe_eval_[A-Za-z0-9]{32}\.bs$/);
          stand.removeHelper(ownedHelper);
        }
        assert.deepEqual(inventory, beforeCli, "CLI evaluator cleanup must succeed without fallback");
        record.cleanup.cliEvaluatorRemoved = true;
      });
      await clean(async () => {
        if (!fixtureAttempted) return;
        const ids = await ownedObjects();
        assert.ok(ids.every((id) => /^[1-9]\d{0,19}$/.test(id)));
        record.cleanup.objects = [];
        for (const id of ids) {
          const state = JSON.parse(
            await ev.eval(
              `var id=Int('${id}');var u=UrlFromDocID(id);var d=OpenDoc(u);` +
                `if(StrInt(d.DocID)!='${id}' || String(d.TopElem.code.Value)!='${marker}') throw 'fixture identity mismatch';` +
                "DeleteDoc(u,true);var opened=false;try{OpenDoc(u);opened=true;}catch(e){}" +
                `return EncodeJson({id:StrInt(id),opened:opened,rows:ArrayCount(XQuery('for $c in cost_centers where $c/id = ${id} return $c')),` +
                `trash:ArrayCount(XQuery('for $t in trash_docs where $t/id = ${id} return $t'))});`,
            ),
          );
          assert.deepEqual(state, { id, opened: false, rows: 0, trash: 0 });
          record.cleanup.objects.push(state);
        }
        assert.deepEqual(await ownedObjects(), []);
        record.cleanup.ownedMarkerAbsent = true;
      });
      await clean(async () => {
        // Export and preview allocate no download records. Archive package IDs are not cleanup authority.
        const nativeCleanup = await cleanupPackageFixtures(ev, { marker, ids: [], operations, packageIds: [] }, null);
        assert.deepEqual(nativeCleanup.cleanup.downloadsDeleted, []);
        record.cleanup.package = nativeCleanup.cleanup;
      });
      await clean(async () => {
        const after = await ev.eval(schemaXml);
        assert.equal(after, baseline);
        record.cleanup.packageSchema = { beforeSha256: sha256(baseline), afterSha256: sha256(after) };
      });
      await clean(async () => {
        const files = (await readdir(artifactsDirectory)).sort();
        if (record.unacknowledgedArtifact) {
          for (const file of record.unacknowledgedArtifact.files) assert.ok(files.includes(file));
        }
        await cleanArtifacts();
        record.cleanup.artifactNamespace = { directory: artifactsDirectory, files, removed: true };
      });
      await clean(() => proxy.close());
      if (cleanupErrors.length) {
        const errors = testFailure ? [testFailure, ...cleanupErrors] : cleanupErrors;
        throw new AggregateError(errors, "Owned fixture cleanup failed");
      }
    }
    assert.deepEqual(proxy.errors, []);
    assert.equal(protocolErrors, 0);
    assert.equal(stderrBytes, 0);
    record.wire = proxy.exchanges;
    record.protocolErrors = protocolErrors;
    record.stderrBytes = stderrBytes;
  });
  assert.deepEqual(stand.inspect(), platform);
  assert.deepEqual(stand.inventory(), evaluatorBaseline);
  assert.deepEqual(await hashes(sourcePaths), sourceFiles);
  assert.deepEqual(await hashes(Object.keys(builtFiles)), builtFiles);
  Object.assign(receipt, {
    date: new Date().toISOString(),
    node: process.version,
    headAtRun: git("rev-parse", "HEAD"),
    carrier: "built CLI / stdio / loopback fault proxy / real HCM SOAP",
    sourceFiles,
    builtFiles,
    evaluatorBaseline,
    containerUnchangedDuringRun: true,
  });
  if (process.env.WSHCM_MCP_RECOVERY_RECEIPT) {
    await writeFile(process.env.WSHCM_MCP_RECOVERY_RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  }
  t.diagnostic(
    JSON.stringify({
      platform: receipt.version,
      runtime: receipt.runtime.readiness,
      helper: receipt.helperRepair,
      cleanup: receipt.cleanup,
    }),
  );
});
