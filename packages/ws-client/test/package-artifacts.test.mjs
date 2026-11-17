import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { watch, truncateSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PackageArtifactStore } from "../build/hcm/packages/artifacts.js";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "bt-artifact-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "source.zip");
  const artifacts = join(directory, "artifacts");
  await writeFile(source, "original ZIP bytes");
  return { source, artifacts, store: new PackageArtifactStore(artifacts) };
}

test("capture persists a separate content-addressed snapshot across store instances", async (t) => {
  const { source, artifacts, store } = await fixture(t);
  const before = Date.now();
  const artifact = await store.capture(source);
  assert.notEqual(artifact.localPath, source);
  assert.equal(artifact.mimeType, "application/zip");
  assert.equal(artifact.sizeBytes, 18);
  assert.equal(artifact.sha256, createHash("sha256").update("original ZIP bytes").digest("hex"));
  assert.ok(Date.parse(artifact.expiresAt) >= before + 24 * 60 * 60 * 1000);
  await writeFile(source, "changed");
  assert.equal(await readFile(artifact.localPath, "utf8"), "original ZIP bytes");
  assert.deepEqual(await new PackageArtifactStore(artifacts).get(artifact.artifactId), artifact);
});

test("get rejects same-size artifact tampering", async (t) => {
  const { source, store } = await fixture(t);
  const artifact = await store.capture(source);
  await writeFile(artifact.localPath, "corrupted ZIP data");
  await assert.rejects(store.get(artifact.artifactId), /integrity|hash|changed/i);
});

test("get rejects a replaced symlink instead of reading its target", async (t) => {
  const { source, store } = await fixture(t);
  const artifact = await store.capture(source);
  await rm(artifact.localPath);
  await symlink(source, artifact.localPath);
  await assert.rejects(store.get(artifact.artifactId));
  assert.equal(await readFile(source, "utf8"), "original ZIP bytes");
});

test("capture rejects relative paths, directories, symlinks and oversize files", async (t) => {
  const { source, artifacts, store } = await fixture(t);
  await assert.rejects(store.capture("relative.zip"), /absolute/i);
  await assert.rejects(store.capture(artifacts));
  const link = `${source}.link`;
  await symlink(source, link);
  await assert.rejects(store.capture(link));
  await truncate(source, 128 * 1024 * 1024 + 1);
  await assert.rejects(store.capture(source), /size|large|limit/i);
});

test("capture rejects a FIFO without waiting for a writer", { timeout: 3000 }, async (t) => {
  if (process.platform === "win32") return t.skip("POSIX FIFO");
  const { source, store } = await fixture(t);
  const { execFileSync } = await import("node:child_process");
  await rm(source);
  execFileSync("mkfifo", [source]);
  await assert.rejects(store.capture(source), /regular|file/i);
});

test("unknown or path-shaped handles do not read arbitrary files", async (t) => {
  const { store } = await fixture(t);
  for (const id of ["unknown", "../source.zip", "00000000-0000-4000-8000-000000000000"]) {
    await assert.rejects(store.get(id));
  }
});

test("an over-limit stream removes its own unfinished copy and preserves the source", async (t) => {
  const { source, artifacts, store } = await fixture(t);
  await mkdir(artifacts);
  await truncate(source, 128 * 1024 * 1024);
  let grew = false;
  const watcher = watch(artifacts, (_event, filename) => {
    if (!grew && filename?.endsWith(".zip")) {
      grew = true;
      truncateSync(source, 129 * 1024 * 1024);
    }
  });
  t.after(() => watcher.close());
  await assert.rejects(store.capture(source), /size|large|limit|changed/i);
  assert.equal(grew, true);
  assert.deepEqual(await readdir(artifacts), []);
  assert.equal((await readFile(source)).length, 129 * 1024 * 1024);
});

test("expired handles cannot authorize reads and do not delete a user's source", async (t) => {
  const { source, store } = await fixture(t);
  const artifact = await store.capture(source);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(artifact.expiresAt) });
  await assert.rejects(store.get(artifact.artifactId), /expired/i);
  assert.equal(await readFile(source, "utf8"), "original ZIP bytes");
  assert.equal(await readFile(artifact.localPath, "utf8"), "original ZIP bytes");
});
