import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { test } from "node:test";
import * as release from "./release.mjs";
import { prepareRelease } from "./prepare-release.mjs";

test("preparation keeps alpha explicit, versions the fixed group and can graduate to stable", async (t) => {
  const root = await fixture(t);
  const { packageManager, devDependencies } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "release-fixture", private: true, packageManager, devDependencies: { prettier: devDependencies.prettier } }),
  );
  await writeFile(join(root, ".prettierrc.json"), "{}");
  await writeFile(join(root, "pnpm-workspace.yaml"), 'packages: ["packages/*"]\nignoreScripts: true\nverifyDepsBeforeRun: error\n');
  await mkdir(join(root, ".changeset"));
  const config = JSON.parse(await readFile(new URL("../.changeset/config.json", import.meta.url), "utf8"));
  await writeFile(join(root, ".changeset/config.json"), JSON.stringify({ ...config, ignore: [] }));
  for (const name of ["bt-cli", "runtime", "eslint-plugin", "ws-client", "mcp-server"]) {
    await mkdir(join(root, "packages", name), { recursive: true });
    await writeFile(
      join(root, "packages", name, "package.json"),
      JSON.stringify({
        name: `@boristype/${name}`,
        version: "0.1.0-alpha.0",
        dependencies: name === "mcp-server" ? { "@boristype/ws-client": "workspace:^" } : {},
      }),
    );
  }
  await writeFile(
    join(root, ".changeset/test.md"),
    '---\n"@boristype/bt-cli": patch\n"@boristype/ws-client": patch\n"@boristype/mcp-server": minor\n---\n\nRelease fixture.\n',
  );
  execFileSync("pnpm", ["install", "--ignore-scripts"], { cwd: root, stdio: "pipe" });
  await assert.rejects(prepareRelease(root, "typo"), /channel/i);
  await prepareRelease(root, "alpha");
  // pnpm exec must work immediately after preparation under verifyDepsBeforeRun:error.
  execFileSync("pnpm", ["exec", "prettier", "--version"], { cwd: root, stdio: "pipe" });
  const manifest = async (name) => JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8"));
  assert.equal((await manifest("ws-client")).version, "0.1.0-alpha.1");
  assert.equal((await manifest("mcp-server")).version, "0.1.0-alpha.1");
  assert.equal((await manifest("mcp-server")).dependencies["@boristype/ws-client"], "workspace:^");
  assert.equal((await manifest("bt-cli")).version, (await manifest("runtime")).version);
  assert.equal((await manifest("runtime")).version, (await manifest("eslint-plugin")).version);
  await prepareRelease(root, "stable");
  execFileSync("pnpm", ["exec", "prettier", "--version"], { cwd: root, stdio: "pipe" });
  assert.equal((await manifest("ws-client")).version, "0.1.0");
  assert.equal((await manifest("mcp-server")).version, "0.1.0");
  assert.ok((await readFile(join(root, "pnpm-lock.yaml"), "utf8")).includes("lockfileVersion"));
});

test("release tag selects one public package and an explicit npm channel", () => {
  assert.deepEqual(release.parseReleaseTag("@boristype/mcp-server@0.2.0-alpha.1"), {
    name: "@boristype/mcp-server",
    version: "0.2.0-alpha.1",
    channel: "next",
    directory: "packages/mcp-server",
  });
  assert.equal(release.parseReleaseTag("@boristype/ws-client@1.0.0").channel, "latest");
  for (const tag of [
    "v1.0.0",
    "@boristype/dotnet-workspace@1.0.0",
    "@boristype/../../foo@1.0.0",
    "@boristype/ws-client@01.0.0",
    "@boristype/ws-client@v1.0.0",
    "@boristype/ws-client@1.0.0+build",
    "@boristype/ws-client@1.0.0\n",
    "@boristype/ws-client@1.0.0;echo foo",
  ]) {
    assert.throws(() => release.parseReleaseTag(tag), /tag|version/i, tag);
  }
});

test("manifest mismatch and private packages cannot be released", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "packages/ws-client"), { recursive: true });
  const path = join(root, "packages/ws-client/package.json");
  await writeFile(path, JSON.stringify({ name: "@boristype/ws-client", version: "0.1.0", private: true }));
  await assert.rejects(release.readRelease(root, "@boristype/ws-client@0.1.0"), /private/i);
  await writeFile(path, JSON.stringify({ name: "@boristype/ws-client", version: "0.1.1" }));
  await assert.rejects(release.readRelease(root, "@boristype/ws-client@0.1.0"), /manifest/i);
});

test("only the exact tagged commit in main history is accepted", async (t) => {
  const root = await fixture(t);
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "main");
  const main = git("rev-parse", "HEAD");
  git("tag", "@boristype/ws-client@0.1.0");
  await release.verifyReleaseCommit(root, main, "@boristype/ws-client@0.1.0", "main");
  git("switch", "-c", "other");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "other");
  const other = git("rev-parse", "HEAD");
  await assert.rejects(release.verifyReleaseCommit(root, other, "@boristype/ws-client@0.1.0", "main"), /tag/i);
  git("tag", "@boristype/ws-client@0.1.1");
  await assert.rejects(release.verifyReleaseCommit(root, other, "@boristype/ws-client@0.1.1", "main"), /main/i);
  const remote = join(root, "remote.git");
  git("init", "--bare", remote);
  git("remote", "add", "origin", remote);
  git("push", "origin", "other", "refs/tags/@boristype/ws-client@0.1.0");
  git("switch", "--detach", main);
  await release.verifyReleaseCommit(root, main, "@boristype/ws-client@0.1.0", "main", "origin");
  git("push", "--force", "origin", `${other}:refs/tags/@boristype/ws-client@0.1.0`);
  await assert.rejects(release.verifyReleaseCommit(root, main, "@boristype/ws-client@0.1.0", "main", "origin"), /remote|moved/i);
});

const bytes = Buffer.from("verified release archive");
const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");
const target = { name: "@boristype/ws-client", version: "0.1.0-alpha.3", channel: "next" };

test("retry accepts only the same immutable tarball; older queued releases cannot rewind a channel", () => {
  assert.equal(release.publicationState(target, bytes, undefined), "publish");
  const existing = { versions: { "0.1.0-alpha.3": { dist: { integrity } } }, "dist-tags": { next: "0.1.0-alpha.4" } };
  assert.equal(release.publicationState(target, bytes, existing), "exists");
  assert.throws(() => release.publicationState(target, Buffer.from("different"), existing), /integrity/i);
  assert.throws(() => release.publicationState(target, bytes, { versions: {}, "dist-tags": { next: "0.1.0-alpha.4" } }), /older|rewind/i);
  assert.throws(() => release.publicationState(target, bytes, { versions: { "0.1.0-alpha.3": { dist: {} } } }), /integrity/i);
});

test("uncertain upload is reconciled by integrity, without a second upload", async () => {
  let uploads = 0;
  let stored;
  const lookup = async () => stored;
  const upload = async () => {
    uploads++;
    stored = { versions: { "0.1.0-alpha.3": { dist: { integrity } } }, "dist-tags": { next: "0.1.0-alpha.3" } };
    throw new Error("Response lost after accepted upload");
  };
  await release.publishVerified(target, bytes, upload, lookup);
  await release.publishVerified(target, bytes, upload, lookup);
  assert.equal(uploads, 1);
  await assert.rejects(release.publishVerified(target, Buffer.from("changed archive"), upload, lookup), /integrity/i);
  assert.equal(uploads, 1);
  await assert.rejects(
    release.publishVerified(target, bytes, upload, async () => {
      throw new Error("Registry HTTP 403");
    }),
    /403/,
  );
  assert.equal(uploads, 1);
});

test("registry absence is distinguished from auth, rate limits, malformed metadata and server errors", async (t) => {
  let status = 404;
  let body = "{}";
  const server = createServer((req, res) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const registry = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await release.registryPackage(target.name, registry), undefined);
  for (status of [401, 403, 429, 500]) {
    await assert.rejects(release.registryPackage(target.name, registry), new RegExp(String(status)));
  }
  status = 200;
  body = "not json";
  await assert.rejects(release.registryPackage(target.name, registry));
  body = "{}";
  await assert.rejects(release.registryPackage(target.name, registry), /metadata/i);
  body = JSON.stringify({ name: target.name, versions: {}, "dist-tags": {} });
  assert.deepEqual(await release.registryPackage(target.name, registry), JSON.parse(body));
});

test("packed dependencies require the intended workspace version, including prereleases", () => {
  const workspace = new Map([["@boristype/ws-client", { version: "0.1.0-alpha.3" }]]);
  assert.deepEqual(release.internalDependencies({ dependencies: { "@boristype/ws-client": "^0.1.0-alpha.3" } }, workspace), [
    { name: "@boristype/ws-client", version: "0.1.0-alpha.3" },
  ]);
  for (const spec of ["workspace:^", "file:../ws-client", "^0.2.0", "^0.1.0"]) {
    assert.throws(() => release.internalDependencies({ dependencies: { "@boristype/ws-client": spec } }, workspace), /dependency/i);
  }
  assert.throws(() => release.internalDependencies({ dependencies: { "@boristype/unknown": "1.0.0" } }, workspace), /dependency/i);
});

test("archive inspection rejects missing build output, leaked sources and version mismatch", async (t) => {
  const root = await fixture(t);
  const dir = join(root, "package");
  await mkdir(join(dir, "build"), { recursive: true });
  const manifest = { name: target.name, version: target.version, main: "build/index.js", types: "build/index.d.ts" };
  await writeFile(join(dir, "package.json"), JSON.stringify(manifest));
  await writeFile(join(dir, "README.md"), "Readme");
  const archive = join(root, "release.tgz");
  const pack = () => execFileSync("tar", ["-czf", archive, "package"], { cwd: root });
  pack();
  await assert.rejects(release.inspectArchive(archive, target), /build|entry/i);
  await writeFile(join(dir, "build/index.js"), "export const ok = true;");
  await writeFile(join(dir, "build/index.d.ts"), "export declare const ok: boolean;");
  pack();
  assert.equal((await release.inspectArchive(archive, target)).version, target.version);
  await writeFile(join(dir, ".env"), "secret");
  pack();
  await assert.rejects(release.inspectArchive(archive, target), /unexpected|forbidden/i);
  await rm(join(dir, ".env"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ ...manifest, version: "9.0.0" }));
  pack();
  await assert.rejects(release.inspectArchive(archive, target), /manifest/i);
});

test("the real pnpm publisher accepts a verified tarball from a detached, dirty checkout in dry-run", async (t) => {
  const root = await fixture(t);
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-b", "main");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "main");
  git("checkout", "--detach");
  await mkdir(join(root, "package/build"), { recursive: true });
  await writeFile(
    join(root, "package/package.json"),
    JSON.stringify({ name: target.name, version: target.version, main: "build/index.js" }),
  );
  await writeFile(join(root, "package/build/index.js"), "module.exports = {};\n");
  const archive = join(root, "package.tgz");
  execFileSync("tar", ["-czf", archive, "package"], { cwd: root });
  const before = await readFile(archive);
  await release.publishTarball(root, archive, target, true);
  assert.deepEqual(await readFile(archive), before);
});

test("isolated installs preserve lifecycle policy and use each CLI's supported invocation", async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, "package/build"), { recursive: true });
  for (const [name, expectedArgs] of [
    ["@boristype/bt-ir", []],
    ["@boristype/mcp-server", ["--help"]],
    ["@boristype/ws-client", undefined],
  ]) {
    const manifest = { name, version: "0.1.0-alpha.1", main: "build/index.js", scripts: { postinstall: 'node -e "process.exit(99)"' } };
    if (expectedArgs) manifest.bin = { probe: "build/index.js" };
    await writeFile(join(root, "package/package.json"), JSON.stringify(manifest));
    await writeFile(
      join(root, "package/build/index.js"),
      expectedArgs
        ? `require('node:assert/strict').deepEqual(process.argv.slice(2), ${JSON.stringify(expectedArgs)});\n`
        : "module.exports = {};\n",
    );
    const archive = join(root, "package.tgz");
    execFileSync("tar", ["-czf", archive, "package"], { cwd: root });
    await release.smoke(new URL("..", import.meta.url).pathname, archive, { name, manifest });
  }
});

test("consumer smoke installs declared peers explicitly when a dependency has a conflicting peer", async (t) => {
  const root = await fixture(t);
  const peerRoot = join(root, "peer");
  await mkdir(join(peerRoot, "package"), { recursive: true });
  await writeFile(
    join(peerRoot, "package/package.json"),
    JSON.stringify({ name: "peer-conflict", version: "1.0.0", peerDependencies: { typescript: "^5.9.3" } }),
  );
  const peerArchive = join(root, "peer.tgz");
  execFileSync("tar", ["-czf", peerArchive, "package"], { cwd: peerRoot });
  await mkdir(join(root, "package/build"), { recursive: true });
  const manifest = {
    name: "@boristype/bt-cli",
    version: "0.1.0-alpha.1",
    main: "build/index.js",
    bin: { probe: "build/index.js" },
    peerDependencies: { typescript: "^6.0.3" },
    devDependencies: { typescript: "^6.0.3" },
    dependencies: { "peer-conflict": `file:${peerArchive}` },
  };
  await writeFile(join(root, "package/package.json"), JSON.stringify(manifest));
  await writeFile(
    join(root, "package/build/index.js"),
    "require('node:assert/strict').equal(require('typescript').versionMajorMinor, '6.0');\n",
  );
  const archive = join(root, "package.tgz");
  execFileSync("tar", ["-czf", archive, "package"], { cwd: root });
  await release.smoke(new URL("..", import.meta.url).pathname, archive, { name: manifest.name, manifest });
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "boristype-release-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
