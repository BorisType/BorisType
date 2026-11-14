import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const usage = "run-probe.mjs <file.bs|file.js> [--message-result <variable>] [--expect <string>] [--check]";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage);
    return;
  }
  const file = args.shift();
  if (!file || file.startsWith("--")) throw new Error(usage);
  let variable;
  let expected;
  let check = false;
  while (args.length) {
    const flag = args.shift();
    if (flag === "--check" && !check) {
      check = true;
    } else if (flag === "--message-result" && variable === undefined && args.length) {
      variable = args.shift();
      if (!/^[A-Za-z_$][\w$]*$/.test(variable)) throw new Error("Invalid result variable");
    } else if (flag === "--expect" && expected === undefined && args.length) {
      expected = args.shift();
    } else {
      throw new Error(`Invalid or repeated option: ${flag}\n${usage}`);
    }
  }
  const original = await readFile(file, "utf8");
  let source = original;
  if (variable !== undefined) {
    const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const trailer = new RegExp(`(^|\\n)[ \\t]*MESSAGE[ \\t]*=[ \\t]*${escaped}[ \\t]*;[ \\t]*(?:\\r?\\n)?$`);
    if (!trailer.test(source)) throw new Error("Expected terminal MESSAGE assignment not found; no code sent");
    source = source.replace(trailer, `$1return ${variable};\n`);
  }
  const sha256 = (text) => createHash("sha256").update(text).digest("hex");
  const evidence = {
    file,
    carrier: "C-runtime/eval/temporary-library",
    sha256: sha256(original),
    evaluatedSha256: sha256(source),
    adaptation: variable === undefined ? "none" : `terminal MESSAGE = ${variable}; -> return ${variable};`,
  };
  if (check) {
    console.log(JSON.stringify({ ...evidence, checkOnly: true }));
    return;
  }
  const { WSHCM_HOST: host, WSHCM_USER: username, WSHCM_PASSWORD: password } = process.env;
  if (!host || !username || !password) throw new Error("Set WSHCM_HOST, WSHCM_USER and WSHCM_PASSWORD for the authorized local stand");
  const port = Number(process.env.WSHCM_PORT ?? 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid WSHCM_PORT");
  const { WshcmClient } = await import("../../../../packages/ws-client/build/index.js");
  const client = new WshcmClient({ overHttps: false, host, port, username, password, requestTimeout: 15000 });
  await client.initialize();
  const evaluator = client.createEvaluator();
  let failure;
  try {
    await evaluator.initialize();
    if ((await evaluator.evalExpr("2 + 2")) !== 4) throw new Error("Evaluator smoke failed");
    const start = performance.now();
    const actual = await evaluator.eval(source);
    const matches = expected === undefined ? undefined : actual === expected;
    console.log(JSON.stringify({ ...evidence, actual, expected, matches, elapsedMs: performance.now() - start }));
    if (matches === false) throw new Error("Probe result differs from expected string");
  } catch (error) {
    failure = error;
  } finally {
    const cleaned = await evaluator.close();
    console.log(JSON.stringify({ cleanup: cleaned ? "confirmed" : "unconfirmed" }));
    if (!cleaned) failure = new Error("Temporary evaluator cleanup unconfirmed; inspect stand before retrying", { cause: failure });
  }
  if (failure) throw failure;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
