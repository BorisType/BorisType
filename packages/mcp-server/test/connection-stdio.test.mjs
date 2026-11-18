import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

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
  assert.equal((await client.listTools()).tools.length, 27);
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
  const unknown = await execute();
  assert.equal(unknown.executionStatus, "unknown");
  assert.equal(unknown.connection.state, "network");
  assert.equal(calls.business, 4);
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
