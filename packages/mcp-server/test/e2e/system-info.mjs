import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { WshcmClient } from "@boristype/ws-client";
import { localStand } from "./stand.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const normalizeNewlines = (text) => text.replace(/\r\n|\r/g, "\n");

test("system information through CLI/stdio/SOAP on the existing local stand", { timeout: 120000 }, async (t) => {
  const stand = localStand();
  const baseline = new Set(stand.evaluators());
  const { client, transport } = stand.createClient();
  let ownedEvaluator;
  t.after(async () => {
    try {
      await client.close();
    } finally {
      const added = stand.evaluators().filter((name) => !baseline.has(name));
      if (added.length) {
        if (ownedEvaluator && added.length === 1 && added[0] === ownedEvaluator) stand.removeEvaluator(ownedEvaluator);
        assert.fail("CLI did not clean up its temporary evaluator");
      }
    }
  });

  const soap = new WshcmClient({
    host: stand.host,
    port: 80,
    overHttps: false,
    username: process.env.WSHCM_E2E_USERNAME,
    password: process.env.WSHCM_E2E_PASSWORD,
    requestTimeout: 15000,
  });
  await soap.initialize();
  const version = await soap.callMethod("tools", "get_version", ["wtv"]);
  const nativeReport = await soap.callMethod("tools_report", "gather_system_info", []);
  assert.equal(typeof nativeReport, "string");
  await client.connect(transport, { timeout: 35000 });

  async function collect(args) {
    let response;
    try {
      response = await client.callTool({ name: "wshcm_get_system_info", arguments: args }, { timeout: 35000 });
    } finally {
      if (!ownedEvaluator) {
        const added = stand.evaluators().filter((name) => !baseline.has(name));
        if (added.length === 1) ownedEvaluator = added[0];
      }
    }
    assert.ok(ownedEvaluator, "Expected exactly one new evaluator; use an exclusive stand");
    // Do not print report contents or arbitrary server diagnostics on failure.
    assert.notEqual(response.isError, true, "System information tool returned an error");
    return JSON.parse(response.content[0].text);
  }
  const overview = await collect({});
  assert.deepEqual(Object.keys(overview), ["summary"]);
  assert.equal(overview.summary.hcmVersion, version);
  const full = await collect({ includeReport: true });
  assert.deepEqual(full.summary, overview.summary);
  assert.equal(typeof full.report, "string");
  assert.ok(Buffer.byteLength(full.report) <= 256 * 1024);
  // Direct SOAP XML parsing normalizes literal CR/CRLF. Compare normalized
  // hashes without leaking native configuration into assertion diagnostics.
  assert.equal(hash(normalizeNewlines(full.report)), hash(normalizeNewlines(nativeReport)));
  for (const section of ["xHTTP.ini", "spxml_unibridge_config.xml", "Global Settings"]) {
    assert.ok(full.report.includes(section), `Expected native section ${section}`);
  }

  // Exercise the same native EncodeJson string carrier independently of report
  // formatting, including CRLF/CR, tabs and Unicode.
  const probe = "CRLF\r\nCR\rLF\n\t Я中👋";
  const carrier = await soap.callMethod(`x-local://wt/${ownedEvaluator}`, "execute", [`return EncodeJson(${JSON.stringify(probe)});`]);
  assert.equal(JSON.parse(carrier), probe);
  t.diagnostic(
    JSON.stringify({
      image: stand.image,
      imageId: stand.imageId,
      carrier: "CLI/stdio/SOAP/EncodeJson; no BorisType DLL",
      summary: full.summary,
      reportBytes: Buffer.byteLength(full.report),
      reportSha256: hash(full.report),
      crlfCount: (full.report.match(/\r\n/g) ?? []).length,
    }),
  );
});
