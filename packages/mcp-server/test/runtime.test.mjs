import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../build/index.js";
import { runtimeTransport } from "../../ws-client/test/helpers/runtime-transport.mjs";

async function connect(t, evaluator) {
  const server = createServer({ evaluator });
  const client = new Client({ name: "runtime-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(b);
  await client.connect(a);
  return client;
}

const body = (result) => JSON.parse(result.content[0].text);

test("runtime status advertises automatic preparation and reports the answering process", async (t) => {
  const transport = runtimeTransport();
  const client = await connect(t, transport);
  const tools = (await client.listTools()).tools;
  const tool = tools.find(({ name }) => name === "wshcm_runtime_status");
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, false);
  assert.match(tool.description, /Automatically prepare/);
  const result = await client.callTool({ name: "wshcm_runtime_status", arguments: {} });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(body(result).status, "ready");
  assert.equal(body(result).process.pid, 41);
  assert.deepEqual(transport.calls, ["bootstrap", "operation", "EnsureJson"]);
});

test("file runtime failures preserve expected, installed, loaded identity and process as JSON", async (t) => {
  let ordinaryCalls = 0;
  const transport = runtimeTransport(
    () => {
      ordinaryCalls++;
      return JSON.stringify('{"rows":[],"returnedRows":0,"truncated":false,"limitReason":null}');
    },
    {
      status: ({ status }) => ({
        ...status,
        status: "restart_required",
        reason: "LoadedBuildMismatch",
        loaded: { ...status.loaded, buildId: "33333333-3333-4333-8333-333333333333" },
      }),
    },
  );
  const client = await connect(t, transport);
  const result = await client.callTool({ name: "wshcm_get_file_info", arguments: { path: "x-local://wt/data.bs" } });
  assert.equal(result.isError, true);
  assert.equal(body(result).error.code, "RuntimeNotReady");
  const status = body(result).runtimeStatus;
  assert.equal(status.status, "restart_required");
  assert.equal(status.process.pid, 41);
  assert.notEqual(status.loaded.buildId, status.installed.buildId);
  assert.deepEqual(status.expected, status.installed);
  assert.equal(ordinaryCalls, 0);
  const query = await client.callTool({ name: "wshcm_xquery", arguments: { query: "query" } });
  assert.notEqual(query.isError, true);
  assert.equal(ordinaryCalls, 1);
});

test("runtime status rechecks after a process restart and clears the stale state", async (t) => {
  let restarted = false;
  const transport = runtimeTransport(undefined, {
    status: ({ status }) =>
      restarted
        ? status
        : {
            ...status,
            status: "restart_required",
            reason: "LoadedBuildMismatch",
            loaded: { ...status.loaded, buildId: "33333333-3333-4333-8333-333333333333" },
          },
  });
  const client = await connect(t, transport);
  assert.equal(body(await client.callTool({ name: "wshcm_runtime_status", arguments: {} })).status, "restart_required");
  restarted = true;
  transport.process.pid = 42;
  transport.process.startedAt = "2026-11-14T12:00:00.0000000Z";
  const result = body(await client.callTool({ name: "wshcm_runtime_status", arguments: {} }));
  assert.equal(result.status, "ready");
  assert.equal(result.process.pid, 42);
  assert.deepEqual(transport.calls.slice(-2), ["operation", "InspectJson"]);
});

test("lost helper upload response remains a structured local error without fabricated process identity", async (t) => {
  const transport = runtimeTransport(undefined, {
    afterBootstrap() {
      throw new Error("Lost upload response");
    },
  });
  const client = await connect(t, transport);
  const result = await client.callTool({ name: "wshcm_runtime_status", arguments: {} });
  assert.equal(result.isError, true);
  assert.equal(body(result).runtimeStatus.reason, "BootstrapTransportError");
  assert.equal(body(result).runtimeStatus.process, null);
  assert.deepEqual(transport.calls, ["bootstrap"]);
});
