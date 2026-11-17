import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { WshcmApi } from "../build/index.js";
import { systemReport, systemSummary } from "./fixtures/system-info.mjs";

function platform(report = systemReport) {
  let calls = 0;
  return {
    api: new WshcmApi({
      eval: async (code) =>
        runInNewContext(`(function () { ${code} })()`, {
          EncodeJson: JSON.stringify,
          tools_report: {
            gather_system_info(...args) {
              calls++;
              assert.deepEqual(args, []);
              return report;
            },
          },
        }),
    }),
    get calls() {
      return calls;
    },
  };
}

test("SDK systemInfo defaults to the overview and ignores configuration keys", async () => {
  const stand = platform();
  assert.equal(typeof stand.api.systemInfo, "function");
  assert.deepEqual(await stand.api.systemInfo(), { summary: systemSummary });
  assert.equal(stand.calls, 1);
});

test("SDK full system report preserves CRLF, Unicode, repeated keys and unredacted fixture values", async () => {
  const stand = platform();
  assert.deepEqual(await stand.api.systemInfo({ includeReport: true }), { summary: systemSummary, report: systemReport });
  assert.equal(stand.calls, 1);
});

test("SDK missing or unrecognized overview values are null, never guessed from config", async () => {
  const stand = platform(
    "WT version: custom-build\nCluster: unknown\nFT Index: Off\nPersonal Data: On\n///// Global Settings /////\nOS version: misleading\n",
  );
  assert.deepEqual(await stand.api.systemInfo({ includeReport: false }), {
    summary: {
      hcmVersion: "custom-build",
      osVersion: null,
      database: { type: null, version: null },
      unibridgeVersion: null,
      runMode: null,
      cluster: null,
      fullTextIndex: false,
      personalData: true,
    },
  });
});

for (const input of [{ includeReport: "true" }, { includeReport: null }, { extra: true }, null]) {
  test(`SDK invalid systemInfo input never reaches the server: ${JSON.stringify(input)}`, async () => {
    let calls = 0;
    const api = new WshcmApi({
      eval: async () => {
        calls++;
        return JSON.stringify(systemReport);
      },
    });
    await assert.rejects(api.systemInfo(input));
    assert.equal(calls, 0);
  });
}

for (const wire of [undefined, 42n, "not JSON", "null", "{}", '""', JSON.stringify("\ud800")]) {
  test(`SDK systemInfo rejects malformed report carriers: ${String(wire)}`, async () => {
    let calls = 0;
    const api = new WshcmApi({
      eval: async () => {
        calls++;
        return wire;
      },
    });
    await assert.rejects(api.systemInfo({ includeReport: true }), /system information/i);
    assert.equal(calls, 1);
  });
}

test("SDK rejects oversized UTF-8 reports without returning a partial report or retrying", async () => {
  let calls = 0;
  const api = new WshcmApi({
    eval: async () => {
      calls++;
      return JSON.stringify("中".repeat(90000));
    },
  });
  await assert.rejects(api.systemInfo({ includeReport: true }), /system information.*256 KiB/i);
  assert.equal(calls, 1);
});

for (const includeReport of [false, true]) {
  test(`SDK accepts exactly 256 KiB UTF-8 and rejects one byte over, includeReport=${includeReport}`, async () => {
    let report = "中".repeat(87381) + "x";
    assert.equal(Buffer.byteLength(report), 262144);
    let calls = 0;
    const api = new WshcmApi({
      eval: async () => {
        calls++;
        return JSON.stringify(report);
      },
    });
    const input = includeReport ? { includeReport: true } : undefined;
    const result = await api.systemInfo(input);
    assert.equal(Object.hasOwn(result, "report"), includeReport);
    if (includeReport) assert.equal(result.report, report);
    assert.equal(calls, 1);
    report += "x";
    await assert.rejects(api.systemInfo(input), /system information.*256 KiB/i);
    assert.equal(calls, 2, "Neither collection is retried");
  });
}

test("SDK systemInfo propagates platform failure without retrying or preparing the file runtime", async () => {
  let calls = 0;
  const api = new WshcmApi({
    eval: async () => {
      calls++;
      throw new Error("gather_system_info unavailable");
    },
  });
  await assert.rejects(api.systemInfo(), /gather_system_info unavailable/);
  assert.equal(calls, 1);
});
