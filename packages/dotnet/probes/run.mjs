import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { WshcmClient } from "../../ws-client/build/index.js";

/** Run a bounded inspection of the explicitly selected local Docker stand. */
function docker(args) {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 5_000, maxBuffer: 1024 * 1024 });
}

/** List evaluator files independently of SOAP to verify cleanup. */
function evaluators(container) {
  return docker([
    "exec",
    container,
    "find",
    "/WebsoftServer/wt",
    "-maxdepth",
    "1",
    "-type",
    "f",
    "-name",
    "unsafe_eval_*.bs",
    "-printf",
    "%f\n",
  ])
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
}

/** Compare the native report with independent Node expectations and JSON decoding. */
function verify(report) {
  let checks = 0;
  const check = (actual, expected) => {
    assert.deepEqual(actual, expected);
    checks++;
  };
  const payload = "  Привет 👋 中文 é\r\nA\rB\n\t<&>\"'\\  ";
  check(report.ping, "pong");
  check(report.empty, "");
  check(report.whitespace, " \t\r\n  ");
  check(report.text, payload);
  check(report.numericText, "000123");
  check(report.entityText, "&#13; ${x} ` $()");
  check(JSON.parse(report.encoded), payload);
  check(JSON.parse(report.encodedNull), null);
  check(report.sum, 42);
  check(report.largeSum, 2147483648);
  check(report.negatedTrue, false);
  check(report.negatedFalse, true);
  check(report.nullArgument, true);
  check(report.emptyIsNull, false);
  const runtime = JSON.parse(report.runtime);
  assert.match(runtime.framework, /^\.NET 9\./);
  assert.equal(runtime.architecture, "X64");
  check(runtime.assembly, "BorisType.PlainProbe");
  const reference = JSON.parse(report.reference);
  check(reference.assembly, "Datex.Global");
  assert.match(reference.version, /^\d+\.\d+\.\d+\.\d+$/);
  check(report.context, true);
  check(report.exceptionCaught, true);
  assert.match(report.exceptionText, /BT_PROBE_EXPECTED_FAILURE/);
  check(report.afterException, "pong");
  return { checks, runtime, reference };
}

/** Execute the unchanged BS once; this runner neither deploys DLLs nor starts services. */
async function main() {
  const { WSHCM_PROBE_CONTAINER: container, WSHCM_USER: username, WSHCM_PASSWORD: password } = process.env;
  assert.ok(container && username && password, "Set WSHCM_PROBE_CONTAINER, WSHCM_USER and WSHCM_PASSWORD for the local stand");
  assert.match(container, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
  const inspect = JSON.parse(
    docker([
      "inspect",
      "--format",
      '{"running":{{.State.Running}},"image":{{json .Config.Image}},"imageId":{{json .Image}},"networks":{{json .NetworkSettings.Networks}}}',
      container,
    ]),
  );
  assert.equal(inspect.running, true, "Start the existing local stand explicitly before this probe");
  const addresses = Object.values(inspect.networks)
    .map((network) => network.IPAddress)
    .filter(Boolean);
  assert.equal(addresses.length, 1, "Expected one directly reachable Docker IPv4 address on the Linux host");
  const source = await readFile(new URL("./bridge.bs", import.meta.url), "utf8");
  const sha256 = createHash("sha256").update(source).digest("hex");
  const dlls = docker([
    "exec",
    container,
    "sha256sum",
    "/WebsoftServer/dotnetcore/shared/BorisType.PlainProbe.dll",
    "/WebsoftServer/dotnetcore/shared/BorisType.DatexProbe.dll",
  ]).trim();
  console.log(
    JSON.stringify({
      image: inspect.image,
      imageId: inspect.imageId,
      carrier: "C-runtime/eval/temporary-library/DotNetCoreHost",
      sha256,
      evaluatedSha256: sha256,
      adaptation: "none",
      dlls,
    }),
  );
  const before = evaluators(container);
  const client = new WshcmClient({ overHttps: false, host: addresses[0], port: 80, username, password, requestTimeout: 15_000 });
  await client.initialize();
  const evaluator = client.createEvaluator();
  let failure;
  try {
    await evaluator.initialize();
    assert.equal(await evaluator.evalExpr("2 + 2"), 4, "SOAP evaluator smoke");
    const report = JSON.parse(await evaluator.eval(source));
    console.log(JSON.stringify({ result: "OK", ...verify(report) }));
  } catch (error) {
    failure = error;
  } finally {
    const cleaned = await evaluator.close();
    let unchanged = false;
    try {
      unchanged = JSON.stringify(evaluators(container)) === JSON.stringify(before);
    } catch (error) {
      failure = new AggregateError([failure, error].filter(Boolean), "Native probe and independent cleanup failed");
    }
    console.log(JSON.stringify({ evaluatorCleanup: cleaned, independentCleanup: unchanged }));
    if (!cleaned || !unchanged) {
      failure = new AggregateError(
        [failure, new Error("Evaluator cleanup unconfirmed; inspect the stand before another run")].filter(Boolean),
        "Native probe cleanup failed",
      );
    }
  }
  if (failure) throw failure;
}

main().catch((error) => {
  const print = (item) => {
    console.error(item.message);
    if (item instanceof AggregateError) item.errors.forEach(print);
  };
  print(error);
  process.exitCode = 1;
});
