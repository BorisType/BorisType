import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { PackageArtifactStore } from "../../ws-client/build/hcm/packages/artifacts.js";
import { objectPackage } from "../../ws-client/test/helpers/package-fixtures.mjs";

const cli = fileURLToPath(new URL("../build/cli.js", import.meta.url));
const result = (type, text) => `<ResultData><Result VALUE-TYPE="${type}">${text}</Result></ResultData>`;
const fault =
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>Server</faultcode><faultstring>Native fixture diagnostic</faultstring></s:Fault></s:Body></s:Envelope>';

async function openSession(t, port, ...args) {
  const errors = [];
  const client = new Client({ name: "connection-test", version: "1" }, { supportedProtocolVersions: ["2025-11-25"] });
  client.onerror = (err) => errors.push(err);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, "--host", "127.0.0.1", "--port", String(port), "--password", "fixture-password", ...args],
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  t.after(async () => {
    await client.close();
    assert.doesNotMatch(stderr, /fixture-password|private-cookie|secret-body/);
    assert.deepEqual(errors, []);
  });
  await client.connect(transport, { timeout: 5000 });
  async function call(name, args, expectError = false) {
    const response = await client.callTool({ name, arguments: args });
    assert.equal(response.isError === true, expectError, response.content[0].text);
    return JSON.parse(response.content[0].text);
  }
  return { client, call, transport, stderr: () => stderr };
}

function missingModule(res) {
  res.writeHead(500);
  res.end(fault.replace("Native fixture diagnostic", "Evaluator module missing"));
}

async function openOwnedHelperBackend(t) {
  const requests = [];
  const modules = [];
  const hcm = {
    installed: undefined,
    async upload(url, res) {
      hcm.installed = url;
      await delay(30);
      res.end(result("bool", "1"));
    },
    probe(url, res) {
      if (hcm.installed === url) res.end(result("integer", "1"));
      else missingModule(res);
    },
  };
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Basic ${Buffer.from("fixture-user:fixture-password").toString("base64")}`);
    if (req.method === "GET") {
      res.setHeader("Set-Cookie", "sid=private-cookie; Path=/");
      res.end();
      return;
    }
    assert.equal(req.headers.cookie, "sid=private-cookie");
    let xml = "";
    for await (const chunk of req) xml += chunk;
    const method = xml.match(/<MethodName>([^<]+)<\/MethodName>/)[1];
    const url = xml.match(/x-local:\/\/wt\/unsafe_eval_[A-Za-z0-9]{32}\.bs/)[0];
    if (method === "put_url_text_server") {
      requests.push(["upload", url]);
      modules.push(xml);
      await hcm.upload(url, res);
    } else if (method === "drop_self") {
      requests.push(["cleanup", url]);
      assert.equal(url, hcm.installed);
      hcm.installed = undefined;
      res.end(result("bool", "1"));
    } else if (xml.includes(">return&#32;1;</arg-0>")) {
      assert.equal(method, "execute");
      requests.push(["probe", url]);
      hcm.probe(url, res);
    } else {
      assert.equal(method, "execute");
      assert.equal(url, hcm.installed);
      requests.push(["business", url]);
      res.end(
        result(
          "Object",
          '<ok VALUE-TYPE="bool">1</ok><value VALUE-TYPE="integer">7</value><output VALUE-TYPE="Array"/><outputTruncated VALUE-TYPE="bool">0</outputTruncated><error VALUE-TYPE="null"/>',
        ),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return { port: server.address().port, hcm, requests, modules };
}

async function openOwnedHelperFixture(t, ...args) {
  const backend = await openOwnedHelperBackend(t);
  const session = await openSession(t, backend.port, "--username", "fixture-user", ...args);
  return {
    ...backend,
    ...session,
    execute: (expectError) => session.call("wshcm_execute", { code: "return 7;" }, expectError),
  };
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`CLI removes its active helper and exits cleanly on ${signal}`, { timeout: 5000, skip: process.platform === "win32" }, async (t) => {
    const { port, hcm, requests } = await openOwnedHelperBackend(t);
    const child = spawn(
      process.execPath,
      [cli, "--host", "127.0.0.1", "--port", String(port), "--username", "fixture-user", "--password", "fixture-password"],
      { env: getDefaultEnvironment() },
    );
    const client = new Client({ name: "signal-test", version: "1" }, { supportedProtocolVersions: ["2025-11-25"] });
    const transport = new StdioServerTransport(child.stdout, child.stdin);
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = once(child, "exit");
        child.kill("SIGKILL");
        await stopped;
      }
      await client.close();
    });
    await client.connect(transport, { timeout: 3000 });
    const response = await client.callTool({ name: "wshcm_execute", arguments: { code: "return 7;" } });
    assert.notEqual(response.isError, true);
    assert.equal(JSON.parse(response.content[0].text).ok, true);
    const ownUrl = hcm.installed;
    assert.ok(ownUrl);

    // Leave stdin open until the child exits so EOF cannot initiate shutdown.
    const stopped = once(child, "close", { signal: t.signal });
    assert.ok(child.kill(signal));
    assert.deepEqual(await stopped, [0, null]);
    assert.deepEqual(
      requests,
      ["upload", "probe", "business", "cleanup"].map((method) => [method, ownUrl]),
    );
    assert.equal(hcm.installed, undefined);
    assert.equal(stderr, "");
  });
}

test("concurrent CLI requests restore a removed helper once at the original URL", { timeout: 5000 }, async (t) => {
  const { client, hcm, requests, modules, execute } = await openOwnedHelperFixture(t);
  await execute();
  const ownUrl = hcm.installed;
  hcm.installed = undefined;
  await Promise.all([execute(), execute()]);
  await client.close();
  assert.deepEqual(
    requests,
    ["upload", "probe", "business", "probe", "upload", "probe", "business", "business", "cleanup"].map((method) => [method, ownUrl]),
  );
  assert.deepEqual(modules, [modules[0], modules[0]]);
  assert.equal(hcm.installed, undefined);
});

for (const installed of [false, true]) {
  const name = installed ? "reuses the surviving helper" : "restores the missing helper";
  test(`CLI ${name} after a lost initial upload response`, { timeout: 5000 }, async (t) => {
    const { client, hcm, requests, execute } = await openOwnedHelperFixture(t);
    const upload = hcm.upload;
    hcm.upload = (url, res) => {
      if (installed) hcm.installed = url;
      res.destroy();
      hcm.upload = upload;
    };
    const first = await execute(true);
    assert.equal(first.connection.state, "network");
    assert.equal(first.executionStatus, "not_started");
    const [[, ownUrl]] = requests;
    assert.deepEqual(requests, [["upload", ownUrl]]);
    await execute();
    await client.close();
    const repair = installed ? [] : ["upload", "probe"];
    assert.deepEqual(
      requests,
      ["upload", "probe", ...repair, "business", "cleanup"].map((method) => [method, ownUrl]),
    );
  });
}

for (const [name, response] of [
  ["missing", missingModule],
  ["wrong", (res) => res.end(result("integer", "2"))],
]) {
  test(`CLI bounds repair when the confirming probe remains ${name}`, { timeout: 5000 }, async (t) => {
    const { client, hcm, requests, execute } = await openOwnedHelperFixture(t);
    await execute();
    const ownUrl = hcm.installed;
    hcm.probe = (_url, res) => response(res);
    const failure = await execute(true);
    assert.equal(failure.connection.state, "evaluator");
    assert.equal(failure.executionStatus, "not_started");
    await client.close();
    assert.deepEqual(
      requests.slice(3),
      ["probe", "upload", "probe", "cleanup"].map((method) => [method, ownUrl]),
    );
  });
}

test("CLI authentication, network, timeout and HTTP probe failures skip helper upload", { timeout: 6000 }, async (t) => {
  const { client, hcm, requests, execute } = await openOwnedHelperFixture(t, "--connection-timeout-ms", "300");
  await execute();
  const ownUrl = hcm.installed;
  for (const [state, response] of [
    ["authentication", (res) => res.writeHead(403).end()],
    ["network", (res) => res.destroy()],
    ["timeout", () => {}],
    ["http", (res) => res.writeHead(503).end("secret-body")],
  ]) {
    hcm.probe = (_url, res) => response(res);
    const failure = await execute(true);
    assert.equal(failure.connection.state, state);
    assert.equal(failure.executionStatus, "not_started");
  }
  await client.close();
  assert.deepEqual(
    requests.slice(3),
    ["probe", "probe", "probe", "probe", "cleanup"].map((method) => [method, ownUrl]),
  );
});

test("CLI EOF during its own helper repair still cleans up that URL", { timeout: 6000 }, async (t) => {
  const { client, hcm, requests, execute } = await openOwnedHelperFixture(t, "--connection-timeout-ms", "300");
  await execute();
  const ownUrl = hcm.installed;
  hcm.installed = undefined;
  const repair = Promise.withResolvers();
  // The server saves the helper but never acknowledges the upload.
  hcm.upload = (url) => {
    hcm.installed = url;
    repair.resolve();
  };
  const pending = execute().catch(() => undefined);
  await Promise.race([repair.promise, pending.then(() => assert.fail("The tool finished before the repair upload started"))]);
  await client.close();
  await pending;
  assert.deepEqual(
    requests.slice(3),
    ["probe", "upload", "cleanup"].map((method) => [method, ownUrl]),
  );
  assert.equal(hcm.installed, undefined);
});

test("real CLI remains usable through offline boot, auth and repeated service outages without replay", { timeout: 15000 }, async (t) => {
  const calls = { get: 0, put: 0, probe: 0, business: 0, cleanup: 0 };
  let status = 503;
  let business = "report";
  const object = { id: "123", formUrl: "x-local://wtv/wtv_cost_center.xmd", root: "cost_center", xml: "<cost_center/>" };
  const server = createServer(async (req, res) => {
    let xml = "";
    for await (const chunk of req) xml += chunk;
    if (req.method === "GET") calls.get++;
    if (status !== 200) {
      res.writeHead(status, { "set-cookie": "private-cookie=value" });
      res.end("secret-body");
      return;
    }
    if (req.method === "GET") {
      res.end();
      return;
    }
    if (xml.includes("<MethodName>put_url_text_server</MethodName>")) {
      calls.put++;
      await delay(30);
      res.end(result("bool", "1"));
      return;
    }
    if (xml.includes("<MethodName>drop_self</MethodName>")) {
      calls.cleanup++;
      res.end(result("bool", "1"));
      return;
    }
    if (xml.includes(">return&#32;1;</arg-0>")) {
      calls.probe++;
      if (business === "missing") {
        res.writeHead(500);
        res.end(fault);
      } else res.end(result("integer", "1"));
      return;
    }
    calls.business++;
    if (business === "drop") {
      res.destroy();
      return;
    }
    if (business === "fault") {
      res.writeHead(500);
      res.end(fault);
      return;
    }
    if (business === "read" || business === "save") {
      const tail = xml.slice(xml.lastIndexOf("BtObjectOperation"));
      assert.ok(tail.includes(business === "read" ? "get_object" : "save_object"));
      const value = { ok: true, ...object, ...(business === "read" ? { schemaXml: object.xml } : { writeStatus: "saved" }) };
      res.end(result("string", JSON.stringify(JSON.stringify(value)).replaceAll("<", "&lt;").replaceAll(">", "&gt;")));
      return;
    }
    assert.match(xml, /gather_system_info/);
    res.end(result("string", '"WT version: fixture"'));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const port = server.address().port;
  const { client, call } = await openSession(t, port);
  assert.equal((await client.listTools()).tools.length, 33);
  await client.ping();
  assert.deepEqual(Object.values(calls), [0, 0, 0, 0, 0]);
  const execute = () => call("wshcm_execute", { code: "return 7;" }, true);
  const info = () => call("wshcm_get_system_info", {});
  const first = await execute();
  assert.equal(first.error.code, "HcmUnavailable");
  assert.equal(first.connection.state, "http");
  assert.deepEqual(first.connection.target, { host: "127.0.0.1", port, https: false });
  assert.equal(first.executionStatus, "not_started");
  assert.doesNotMatch(JSON.stringify(first), /secret-body|private-cookie|fixture-password/);
  const count = calls.get;
  const local = await call("wshcm_inspect_package", { inspectionId: "11111111-1111-4111-8111-111111111111" }, true);
  assert.equal(local.code, "InspectionRequired");
  assert.equal(calls.get, count);
  const operationId = "22222222-2222-4222-8222-222222222222";
  const unavailablePackage = await call("wshcm_get_package_operation", { operationId }, true);
  assert.equal(unavailablePackage.operationId, operationId);
  assert.equal(unavailablePackage.error.code, "HcmUnavailable");
  assert.equal(unavailablePackage.phase, "transport");
  status = 403;
  const refused = await call("wshcm_get_object", { id: "123" }, true);
  assert.equal(refused.error.code, "HcmAuthenticationFailed");
  assert.equal(refused.connection.retryable, false);
  assert.equal(refused.id, "123");
  assert.equal(refused.writeStatus, "not_attempted");
  status = 200;
  const pair = await Promise.all([info(), info()]);
  assert.ok(pair.every((value) => value.summary.hcmVersion === "fixture"));
  assert.deepEqual(Object.values(calls), [4, 1, 1, 2, 0]);
  business = "fault";
  const native = await client.callTool({ name: "wshcm_get_system_info", arguments: {} });
  assert.equal(native.isError, true);
  assert.match(native.content[0].text, /Native fixture diagnostic/);
  assert.doesNotMatch(native.content[0].text, /HcmUnavailable/);
  business = "drop";
  const beforeDrop = calls.business;
  const unknown = await execute();
  assert.equal(unknown.executionStatus, "unknown");
  assert.equal(unknown.connection.state, "network");
  assert.equal(calls.business, beforeDrop + 1);
  business = "read";
  const { readToken } = await call("wshcm_get_object", { id: object.id });
  assert.equal(typeof readToken, "string");
  business = "report";
  for (let i = 0; i < 2; i++) {
    status = 503;
    const runtime = await call("wshcm_runtime_status", {}, true);
    assert.equal(runtime.error.code, "HcmUnavailable");
    assert.equal(runtime.runtimeStatus.status, "blocked");
    status = 200;
    await info();
    assert.equal(calls.put, 1);
  }
  assert.equal(calls.business, 7);
  business = "save";
  const saved = await call("wshcm_save_object", { mode: "replace", id: object.id, readToken, xml: object.xml });
  assert.equal(saved.writeStatus, "saved");
  assert.equal(calls.business, 8);
  business = "missing";
  const missing = await execute();
  assert.equal(missing.executionStatus, "not_started");
  assert.equal(missing.connection.state, "evaluator");
  assert.equal(calls.business, 8);
  await client.close();
  assert.equal(calls.cleanup, 1);
});

test("CLI isolates ZIP capture even when a new inspection fails before dispatch", { timeout: 5000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bt-cli-artifacts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifactDirectory = join(root, "private artifacts");
  const source = join(root, "outside-store.zip");
  const bytes = objectPackage();
  await writeFile(source, bytes);
  const store = new PackageArtifactStore(artifactDirectory);
  const exported = await store.capture(source);
  const before = await readdir(artifactDirectory);
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(503).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const inbox = join(root, "import");
  const sharedExport = join(root, "export");
  const project = join(root, "project");
  await Promise.all([mkdir(inbox), mkdir(sharedExport), mkdir(project)]);
  const { client, call } = await openSession(
    t,
    server.address().port,
    "--package-artifact-directory",
    artifactDirectory,
    "--package-import-directory",
    inbox,
    "--package-export-directory",
    sharedExport,
    "--project-directory",
    project,
  );
  for (const [file, localPath] of [
    [join(project, "root.zip"), "root.zip"],
    [join(sharedExport, "in.zip"), join(sharedExport, "in.zip")],
  ]) {
    await writeFile(file, "invalid");
    const rejected = await call("wshcm_inspect_package", { localPath }, true);
    assert.equal(rejected.code, "InvalidPackage");
  }
  const denied = await call("wshcm_inspect_package", { localPath: source }, true);
  assert.equal(denied.code, "ImportPathDenied");
  assert.equal(denied.status, "not_attempted");
  assert.deepEqual(requests, []);
  const error = await call("wshcm_inspect_package", { artifactId: exported.artifactId }, true);
  assert.equal(error.error.code, "HcmUnavailable");
  assert.equal(error.artifact, undefined);
  assert.equal(error.artifactId, undefined);
  assert.deepEqual(requests, ["/spxml_web/main.htm"]);

  const additions = (await readdir(artifactDirectory)).filter((file) => !before.includes(file));
  assert.equal(additions.length, 2);
  const sidecar = additions.find((file) => file.endsWith(".json"));
  const { artifactId, localPath, sha256 } = JSON.parse(await readFile(join(artifactDirectory, sidecar), "utf8"));
  assert.notEqual(artifactId, exported.artifactId);
  assert.equal(localPath, join(artifactDirectory, artifactId + ".zip"));
  assert.equal(sha256, exported.sha256);
  assert.deepEqual(await readFile(localPath), bytes);

  const staged = join(inbox, "source.zip");
  await writeFile(staged, bytes);
  const allowed = await call("wshcm_inspect_package", { localPath: staged }, true);
  assert.equal(allowed.error.code, "HcmUnavailable");

  await client.close();
  await rm(artifactDirectory, { recursive: true });
  await assert.rejects(readdir(artifactDirectory), { code: "ENOENT" });
  assert.deepEqual(await readFile(source), bytes);
});

test("CLI EOF before any tool makes zero backend requests", { timeout: 5000 }, async (t) => {
  const server = createServer((_req, res) => {
    res.end();
    assert.fail("Unexpected backend request");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { client, stderr } = await openSession(t, server.address().port);
  await client.close();
  assert.equal(stderr(), "");
});

test("invalid connection options fail before starting stdio", () => {
  for (const args of [
    ["--connection-timeout-ms", "0"],
    ["--connection-timeout-ms", "1.2"],
    ["--port", "80junk"],
    ["--host", "user:secret@localhost"],
  ]) {
    const proc = spawnSync(process.execPath, [cli, ...args], { input: "", encoding: "utf8", timeout: 4000 });
    assert.equal(proc.status, 1);
    assert.equal(proc.stdout, "");
    assert.match(proc.stderr, /must be|invalid/i);
    assert.doesNotMatch(proc.stderr, /user:secret/);
  }
});

test("CLI rejects a relative package artifact directory before stdio starts", () => {
  const proc = spawnSync(process.execPath, [cli, "--package-artifact-directory", "relative/path"], {
    input: "",
    encoding: "utf8",
    timeout: 4000,
  });
  assert.equal(proc.status, 1);
  assert.equal(proc.stdout, "");
  assert.match(proc.stderr, /Artifact directory must be absolute/);
});

test("CLI recovers when a previously refused TCP port begins serving HCM", { timeout: 10000 }, async (t) => {
  const server = createServer(async (req, res) => {
    let xml = "";
    for await (const chunk of req) xml += chunk;
    if (req.method === "GET") res.end();
    else if (xml.includes("gather_system_info")) res.end(result("string", '"WT version: late"'));
    else if (xml.includes(">return&#32;1;</arg-0>")) res.end(result("integer", "1"));
    else res.end(result("bool", "1"));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { client, call } = await openSession(t, port);
  const offline = await call("wshcm_get_system_info", {}, true);
  assert.equal(offline.connection.state, "network");
  await client.ping();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  assert.equal((await call("wshcm_get_system_info", {})).summary.hcmVersion, "late");
  await client.close();
});

test("CLI EOF during a stalled setup bounds cleanup and reports an unconfirmed deletion", { timeout: 7000 }, async (t) => {
  const started = Promise.withResolvers();
  let drops = 0;
  let calls = 0;
  const server = createServer(async (req, res) => {
    let xml = "";
    for await (const chunk of req) xml += chunk;
    if (req.method === "GET") res.end();
    else if (xml.includes("<MethodName>put_url_text_server</MethodName>")) started.resolve();
    else if (xml.includes("<MethodName>drop_self</MethodName>")) {
      drops++;
      res.end(result("bool", "0"));
    } else {
      calls++;
      res.end(result("bool", "1"));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const { client, stderr } = await openSession(t, server.address().port, "--connection-timeout-ms", "200");
  const pending = client.callTool({ name: "wshcm_get_system_info", arguments: {} }).catch(() => undefined);
  await started.promise;
  await client.close();
  await pending;
  assert.equal(calls, 0);
  assert.equal(drops, 1);
  assert.match(stderr(), /cleanup was not confirmed/);
});
