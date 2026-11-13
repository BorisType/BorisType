import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as recovery from "./release-recovery.mjs";

const target = { name: "@boristype/ws-client", version: "0.1.0-alpha.3", channel: "next" };
const bytes = Buffer.from("reviewed archive");
const context = { commit: "a".repeat(40), attempt: 2 };
const intent = {
  schema: 1,
  name: target.name,
  version: target.version,
  channel: "next",
  sha512: createHash("sha512").update(bytes).digest("hex"),
  commit: context.commit,
  attempt: 1,
  status: "attempted",
};

test("a cancelled or uncertain earlier upload can only resume verification", () => {
  for (const status of ["attempted", "accepted", "unknown"]) {
    assert.equal(recovery.uploadMode(target, bytes, context, [{ ...intent, status }]), "verify");
  }
  assert.equal(recovery.uploadMode(target, bytes, context, []), "upload");
});

test("only an explicitly rejected attempt permits a new upload", () => {
  assert.equal(recovery.uploadMode(target, bytes, context, [intent, { ...intent, status: "rejected" }]), "upload");
  assert.equal(
    recovery.uploadMode(target, bytes, { ...context, attempt: 3 }, [
      intent,
      { ...intent, status: "unknown" },
      { ...intent, attempt: 2, status: "rejected" },
    ]),
    "verify",
  );
});

test("receipts cannot authorize a different artifact, commit, version or unknown state", () => {
  for (const change of [
    { sha512: "0".repeat(128) },
    { commit: "b".repeat(40) },
    { version: "9.0.0" },
    { status: "typo" },
    { schema: 2 },
    { attempt: 99 },
    { name: "@boristype/bt-cli" },
  ]) {
    assert.throws(() => recovery.uploadMode(target, bytes, context, [{ ...intent, ...change }]), /receipt|attempt|intent/i);
  }
});

test("only publication state artifacts are restored and expired evidence fails closed", () => {
  const artifacts = [
    { id: 1, name: "npm-release", expired: false },
    { id: 2, name: "npm-upload-intent-1", expired: false },
    { id: 3, name: "npm-upload-result-1", expired: false },
  ];
  assert.deepEqual(recovery.receiptArtifactIds(artifacts), [2, 3]);
  assert.throws(() => recovery.receiptArtifactIds([{ ...artifacts[1], expired: true }]), /expired/i);
});

test("missing receipts after an earlier upload step cannot be mistaken for a fresh publication", () => {
  const jobs = [{ name: "publish", run_attempt: 1, steps: [{ name: "Upload once with npm trusted publishing", conclusion: "cancelled" }] }];
  assert.throws(() => recovery.receiptArtifactIds([], jobs, 2), /missing.*receipt|evidence/i);
  assert.deepEqual(recovery.receiptArtifactIds([{ id: 2, name: "npm-upload-intent-1", expired: false }], jobs, 2), [2]);
  assert.deepEqual(recovery.receiptArtifactIds([], [{ ...jobs[0], steps: [{ ...jobs[0].steps[0], conclusion: "skipped" }] }], 2), []);
});

test("a partial artifact download cannot erase a cancelled upload after a rejected attempt", () => {
  const artifacts = [
    { id: 1, name: "npm-upload-intent-1", expired: false },
    { id: 2, name: "npm-upload-result-1", expired: false },
    { id: 3, name: "npm-upload-intent-2", expired: false },
  ];
  const restored = [intent, { ...intent, status: "rejected" }];
  assert.throws(() => recovery.assertRestoredReceipts(artifacts, restored), /missing|incomplete|receipt/i);
  restored.push({ ...intent, attempt: 2 });
  recovery.assertRestoredReceipts(artifacts, restored);
  assert.throws(() => recovery.assertRestoredReceipts(artifacts, [...restored, restored[0]]), /receipt/i);
});

test("registry rejection is distinct from lost responses, availability timeouts and conflicts", () => {
  const rejected = {
    stderr:
      "Error: ERR_PNPM_FAILED_TO_PUBLISH\nFailed to publish package @boristype/ws-client@0.1.0-alpha.3 (status 403 Forbidden): denied",
  };
  assert.equal(recovery.uploadOutcome(rejected, target), "rejected");
  for (const error of [
    new Error("ECONNRESET"),
    { stderr: "ERR_PNPM_PUBLISH_AVAILABILITY_TIMEOUT" },
    { stderr: rejected.stderr.replace("403 Forbidden", "409 Conflict") },
    { stderr: rejected.stderr.replace(target.name, "@boristype/bt-cli") },
    { stderr: `Error: ERR_PNPM_OTHER\nDetails:\n${rejected.stderr}` },
    {
      stderr: `ERR_PNPM_FAILED_TO_PUBLISH\nFailed to publish package ${target.name}@${target.version} (status 500 Internal Server Error): ${JSON.stringify({ error: rejected.stderr })}`,
    },
  ]) {
    assert.equal(recovery.uploadOutcome(error, target), "unknown");
  }
  assert.equal(recovery.uploadOutcome(undefined, target), "accepted");
});

test("the persisted upload result makes an uncertain attempt verification-only on rerun", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "boristype-upload-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let uploads = 0;
  const firstContext = { ...context, attempt: 1 };
  const result = await recovery.performUpload(target, bytes, firstContext, dir, async () => {
    uploads++;
    throw new Error("lost response");
  });
  assert.equal(result, "unknown");
  const receipt = JSON.parse(await readFile(join(dir, "upload-result.json"), "utf8"));
  assert.equal(receipt.status, "unknown");
  assert.equal(recovery.uploadMode(target, bytes, context, [receipt]), "verify");
  assert.equal(uploads, 1);
});

test("receipt discovery preserves nested artifact results and rejects malformed evidence", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "boristype-receipts-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "npm-upload-intent-1"));
  await writeFile(join(dir, "npm-upload-intent-1/upload-intent.json"), JSON.stringify(intent));
  assert.deepEqual(await recovery.readReceipts(dir), [intent]);
  await writeFile(join(dir, "npm-upload-intent-1/upload-intent.json"), "not json");
  await assert.rejects(recovery.readReceipts(dir));
});

test("the pinned real pnpm rejection diagnostic permits retry only after a rejected PUT", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "boristype-pnpm-rejection-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "package"));
  await writeFile(join(dir, "package/package.json"), JSON.stringify({ name: target.name, version: target.version }));
  const archive = join(dir, "package.tgz");
  execFileSync("tar", ["-czf", archive, "package"], { cwd: dir });
  let puts = 0;
  let status = 403;
  let message = "fixture rejected this upload";
  const instance = createServer((req, res) => {
    if (req.method === "PUT") puts++;
    res.writeHead(req.method === "PUT" ? status : 404, { "Content-Type": "application/json" });
    req.resume();
    res.end(JSON.stringify({ error: message }));
  });
  await new Promise((resolve) => instance.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => instance.close(resolve)));
  const base = `http://127.0.0.1:${instance.address().port}`;
  const auth = join(dir, "auth.npmrc");
  await writeFile(auth, `//127.0.0.1:${instance.address().port}/:_authToken=fixture-token\n`);
  const publish = async () => {
    try {
      await promisify(execFile)(
        "pnpm",
        [
          "publish",
          archive,
          "--no-git-checks",
          "--registry",
          base,
          "--npmrc-auth-file",
          auth,
          "--access",
          "public",
          "--config.ignore-scripts=true",
          "--publish-wait-timeout=0",
        ],
        { cwd: dir, timeout: 15_000 },
      );
    } catch (error) {
      return error;
    }
  };
  const failure = await publish();
  assert.equal(puts, 1);
  assert.equal(recovery.uploadOutcome(failure, target), "rejected", failure?.stderr);
  status = 500;
  message = `Failed to publish package ${target.name}@${target.version} (status 403 Forbidden): denied`;
  const uncertain = await publish();
  assert.equal(puts, 2);
  assert.equal(recovery.uploadOutcome(uncertain, target), "unknown", uncertain?.stderr);
});
