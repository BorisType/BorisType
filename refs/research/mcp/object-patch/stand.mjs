import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { WshcmClient } from "../../../../packages/ws-client/build/index.js";
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
export async function withStand(run) {
  assert.ok(process.env.WSHCM_USERNAME && process.env.WSHCM_PASSWORD, "WSHCM_USERNAME and WSHCM_PASSWORD required");
  const container = process.env.WSHCM_CONTAINER ?? "boristype-c-runtime-net9-wt-1";
  const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 10000 }).trim();
  const base = "/WebsoftServer/wt";
  const inventory = () =>
    docker("exec", container, "find", base, "-maxdepth", "1", "-type", "f", "-name", "unsafe_eval_*.bs", "-printf", "%f\n")
      .split("\n")
      .filter(Boolean)
      .sort();
  const baseline = inventory();
  const client = new WshcmClient({
    host: process.env.WSHCM_HOST ?? "localhost",
    port: Number(process.env.WSHCM_PORT ?? 80),
    overHttps: false,
    username: process.env.WSHCM_USERNAME,
    password: process.env.WSHCM_PASSWORD,
    requestTimeout: 60000,
  });
  const call = client.callMethod.bind(client);
  let own;
  client.callMethod = (library, method, args) => {
    if (library === "tools" && method === "put_url_text_server") {
      const match = /^x-local:\/\/wt\/(unsafe_eval_[A-Za-z0-9]{32}\.bs)$/.exec(args[0]);
      assert.ok(match && !baseline.includes(match[1]));
      own = match[1];
    }
    return call(library, method, args);
  };
  const evaluator = client.createEvaluator();
  const receipt = {
    marker: randomUUID().replaceAll("-", ""),
    image: docker("inspect", "--format", "{{.Image}}", container),
    sourceHashes: [],
    cleanup: {},
  };
  let ready = false;
  const ev = {
    eval(code) {
      receipt.sourceHashes.push(sha256(code));
      return evaluator.eval(code);
    },
  };
  try {
    await client.initialize();
    await evaluator.initialize();
    ready = true;
    receipt.version = JSON.parse(await ev.eval("return EncodeJson(tools.get_version('wtv',false));"));
    await run(ev, receipt);
  } finally {
    try {
      if (ready) assert.equal(await evaluator.close(), true);
    } finally {
      if (own && inventory().includes(own)) docker("exec", container, "rm", "--", base + "/" + own);
      assert.deepEqual(inventory(), baseline);
      receipt.cleanup.evaluatorInventoryUnchanged = true;
    }
  }
  return receipt;
}
