import assert from "node:assert/strict";
import { test } from "node:test";
import { WshcmDispatchError } from "../build/exceptions.js";
import { runAgent } from "../build/hcm/run-agent.js";

const agentId = "9007199254740993";

test("agent launch sends an exact ID and serializes parameter values as data", async () => {
  const params = { note: " Я'\\\r\n${request} $& 👋 " };
  let calls = 0;
  const result = await runAgent(
    {
      async eval(source) {
        calls++;
        const match = source.match(/ParseJson\(('.*')\)/);
        assert.ok(match);
        const request = JSON.parse(JSON.parse('"' + match[1].slice(1, -1).replace(/\\'/g, "'") + '"'));
        assert.equal(request.agentId, agentId);
        assert.equal(request.mode, "async");
        assert.deepEqual(request.params, [{ name: "note", value: params.note }]);
        assert.equal(request.objectsIds, "9007199254741000;9007199254741001");
        return JSON.stringify({ agentId, status: "accepted" });
      },
    },
    { agentId, params, objectIds: ["9007199254741000", "9007199254741001"] },
  );
  assert.deepEqual(result, { agentId, status: "accepted" });
  assert.equal(calls, 1);
});

test("agent launch rejects code, imprecise IDs, reserved parameters and unbounded waits before dispatch", async () => {
  for (const input of [
    { agentId: Number(agentId) },
    { agentId: "18446744073709551616" },
    { agentId, code: "return 1;" },
    { agentId, params: { note: false } },
    { agentId, params: { ParentTraceId: "override" } },
    { agentId, params: { constructor: "override" } },
    JSON.parse('{"agentId":"1","params":{"__proto__":"override"}}'),
    { agentId, objectIds: ["1;2"] },
    { agentId, waitTimeoutMs: 1 },
    { agentId, mode: "sync", waitTimeoutMs: 20001 },
  ]) {
    let calls = 0;
    await assert.rejects(runAgent({ eval: async () => calls++ }, input));
    assert.equal(calls, 0);
  }
});

test("sync agent launch reports ending and a wait timeout as distinct receipts", async () => {
  for (const status of ["ended", "wait_timeout"]) {
    const result = await runAgent({ eval: async () => JSON.stringify({ agentId, status }) }, { agentId, mode: "sync" });
    assert.deepEqual(result, { agentId, status });
  }
});

test("agent launch preserves native validation failures", async () => {
  const details = {
    agentId,
    phase: "validation",
    executionStatus: "not_started",
    error: { code: "UnknownParameter", message: "Agent parameter is undeclared" },
  };
  await assert.rejects(runAgent({ eval: async () => JSON.stringify(details) }, { agentId, params: { note: "new" } }), (error) => {
    assert.equal(error.name, "WshcmRunAgentError");
    assert.deepEqual(error.details, details);
    return true;
  });
});

test("agent launch does not replay a lost or invalid reply", async () => {
  for (const [evaluate, phase, executionStatus] of [
    [
      async () => {
        throw new WshcmDispatchError("offline", false);
      },
      "transport",
      "not_started",
    ],
    [
      async () => {
        throw new WshcmDispatchError("connection lost", true);
      },
      "transport",
      "unknown",
    ],
    [
      async () => {
        throw new Error("transport timed out");
      },
      "transport",
      "unknown",
    ],
    [async () => "malformed", "response", "unknown"],
    [async () => JSON.stringify({ agentId: "9007199254740994", status: "accepted" }), "response", "unknown"],
    [async () => JSON.stringify({ agentId, status: "ended" }), "response", "unknown"],
  ]) {
    let calls = 0;
    await assert.rejects(
      runAgent(
        {
          eval: async () => {
            calls++;
            return evaluate();
          },
        },
        { agentId },
      ),
      (error) => {
        assert.equal(error.name, "WshcmRunAgentError");
        assert.equal(error.details.agentId, agentId);
        assert.equal(error.details.phase, phase);
        assert.equal(error.details.executionStatus, executionStatus);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});
