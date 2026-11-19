import assert from "node:assert/strict";
import { test } from "node:test";
import { WshcmApi } from "../build/index.js";

const carrier = (value = -7n, output = []) => ({
  ok: true,
  value,
  output: output.map(JSON.stringify),
  outputTruncated: false,
  error: null,
});

test("SDK execute returns typed values and exact diagnostic text with one evaluation", async () => {
  let calls = 0;
  const code = 'print("Я中👋\\r\\n"); return -7; // ${codeLiteral} $&';
  const api = new WshcmApi({
    eval: async (source) => {
      calls++;
      const literal = source.match(/^var _execSource = (.+);$/m)?.[1];
      assert.equal(JSON.parse(literal), code);
      return carrier(
        {
          entries: [
            ['"id"', -9007199254740993n],
            ['"score"', 1],
            ['"text"', '"  Я中👋\\r\\n  "'],
            ['"missing"', undefined],
          ],
        },
        ["before\r\n\tЯ中👋"],
      );
    },
  });
  assert.equal(typeof api.execute, "function");
  assert.deepEqual(await api.execute({ code }), {
    ok: true,
    value: { id: -9007199254740993n, score: 1, text: "  Я中👋\r\n  ", missing: undefined },
    output: ["before\r\n\tЯ中👋"],
    outputTruncated: false,
  });
  assert.equal(calls, 1);
});

test("SDK execute preserves undefined return independently of null", async () => {
  for (const value of [undefined, null]) {
    const result = await new WshcmApi({ eval: async () => ({ ...carrier(), value }) }).execute({ code: "var n = 1;" });
    assert.equal(result.value, value);
    assert.ok(Object.hasOwn(result, "value"));
  }
});

for (const phase of ["execution", "result"]) {
  test(`SDK execute preserves diagnostics and native errors in phase ${phase}`, async () => {
    const api = new WshcmApi({
      eval: async () => ({
        ok: false,
        value: null,
        output: ['"before\\r\\n"'],
        outputTruncated: true,
        error: { phase, message: '"Native failure\\r\\n(eval, line 2)"' },
      }),
    });
    assert.deepEqual(await api.execute({ code: "throw 'failure';" }), {
      ok: false,
      output: ["before\r\n"],
      outputTruncated: true,
      error: { phase, message: "Native failure\r\n(eval, line 2)" },
    });
  });
}

for (const input of [
  {},
  { code: " " },
  { code: "\0" },
  { code: "\ud800" },
  { code: "中".repeat(21846) },
  { code: "return 1;", timeout: 1 },
  null,
]) {
  test(`SDK execute validates input before server execution: ${JSON.stringify(input).slice(0, 65)}`, async () => {
    const api = new WshcmApi({ eval: async () => assert.fail("Invalid input reached HCM") });
    await assert.rejects(api.execute(input));
  });
}

for (const response of [
  undefined,
  "not an envelope",
  { ...carrier(), ok: "yes" },
  { ...carrier(), output: ["not JSON"] },
  { ...carrier(), error: { phase: "execution", message: '"bad"' } },
  { ...carrier(), outputTruncated: 1 },
  carrier({
    entries: [
      ['"duplicate"', 1n],
      ['"duplicate"', 2n],
    ],
  }),
  carrier('"' + "x".repeat(262145) + '"'),
]) {
  test("SDK execute rejects malformed/oversized replies with an unknown execution outcome", async () => {
    let calls = 0;
    const api = new WshcmApi({
      eval: async () => {
        calls++;
        return response;
      },
    });
    await assert.rejects(api.execute({ code: "return 1;" }), (error) => {
      assert.equal(error.details.phase, "response");
      assert.equal(error.details.executionStatus, "unknown");
      return true;
    });
    assert.equal(calls, 1);
  });
}

test("SDK execute reports transport failure as unknown and never retries", async () => {
  let calls = 0;
  const api = new WshcmApi({
    eval: async () => {
      calls++;
      throw new Error("request timed out");
    },
  });
  await assert.rejects(api.execute({ code: "return 1;" }), (error) => {
    assert.equal(error.details.phase, "transport");
    assert.equal(error.details.executionStatus, "unknown");
    assert.match(error.message, /timed out/);
    return true;
  });
  assert.equal(calls, 1);
});

test("explicit pre-dispatch failure preserves a known unstarted execute/save", async () => {
  const sdk = await import("../build/index.js");
  assert.equal(typeof sdk.WshcmDispatchError, "function");
  for (const dispatched of [false, true]) {
    const cause = new sdk.WshcmDispatchError("HCM unavailable", dispatched);
    const api = new WshcmApi({
      eval: async () => {
        throw cause;
      },
    });
    await assert.rejects(api.execute({ code: "return 1;" }), (err) => {
      assert.equal(err.details.executionStatus, dispatched ? "unknown" : "not_started");
      assert.equal(err.cause, cause);
      return true;
    });
    await assert.rejects(
      api.objects.save({ mode: "create", formUrl: "x-local://wtv/wtv_cost_center.xmd", xml: "<cost_center/>" }),
      (err) => {
        assert.equal(err.details.writeStatus, dispatched ? "unknown" : "not_attempted");
        assert.equal(err.cause, cause);
        return true;
      },
    );
  }
});
