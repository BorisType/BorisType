import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { inspectArchive } from "../../../tools/release.mjs";

test("real npm archive carries verified runtime assets and resolves them from the extracted SDK", { timeout: 60_000 }, async () => {
  const packageRoot = fileURLToPath(new URL("../", import.meta.url));
  const temporary = await mkdtemp(join(packageRoot, ".pack-smoke-"));
  try {
    const pnpm = process.env.npm_execpath;
    assert.ok(pnpm, "Run archive verification via pnpm test");
    const nodeScript = /\.[cm]?js$/i.test(pnpm);
    const archive = join(temporary, "ws-client.tgz");
    execFileSync(
      nodeScript ? process.execPath : pnpm,
      [...(nodeScript ? [pnpm] : []), "pack", "--out", archive, "--config.ignore-scripts=true"],
      { cwd: packageRoot, timeout: 30_000, stdio: "pipe" },
    );
    const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
    for (const entry of entries) assert.match(entry, /^package\/(?:build\/|resources\/|package\.json$|README\.md$|LICENSE(?:\.md)?$)/);
    execFileSync("tar", ["-xzf", archive, "-C", temporary]);
    const extracted = join(temporary, "package");
    const bundle = join(extracted, "resources/dotnet");
    const manifest = JSON.parse(await readFile(join(bundle, "manifest.json"), "utf8"));
    const packageManifest = JSON.parse(await readFile(join(extracted, "package.json"), "utf8"));
    const target = { name: packageManifest.name, version: packageManifest.version };
    await inspectArchive(archive, target);
    const altered = structuredClone(manifest);
    altered.component.buildId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await writeFile(join(bundle, "manifest.json"), JSON.stringify(altered));
    execFileSync("tar", ["-czf", archive, "package"], { cwd: temporary });
    await assert.rejects(inspectArchive(archive, target, { verifyManagedIdentity: true }), /runtime assembly identity mismatch/i);
    await writeFile(join(bundle, "manifest.json"), JSON.stringify(manifest));
    execFileSync("tar", ["-czf", archive, "package"], { cwd: temporary });
    await inspectArchive(archive, target, { verifyManagedIdentity: true });
    for (const kind of ["bootstrap", "component"]) {
      const descriptor = manifest[kind];
      assert.deepEqual((await readdir(join(bundle, kind))).sort(), descriptor.files.map((file) => file.path).sort());
      for (const file of descriptor.files) {
        assert.match(file.path, /\.(?:dll|deps\.json)$/);
        const bytes = await readFile(join(bundle, kind, file.path));
        assert.equal(bytes.length, file.bytes);
        assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
      }
    }
    const sdk = await import(pathToFileURL(join(extracted, "build/index.js")));
    const carrier = { rows: [{ entries: [['"id"', 7349577710243911718n]] }], returnedRows: 1n, truncated: false, limitReason: null };
    const api = new sdk.WshcmApi({ eval: async () => carrier });
    assert.deepEqual(await api.xquery({ query: "sql: SELECT id" }), {
      rows: [{ id: 7349577710243911718n }],
      returnedRows: 1,
      truncated: false,
      limitReason: null,
    });
    const deps = manifest.component.files.find((file) => file.path.endsWith(".deps.json"));
    const { appendFile } = await import("node:fs/promises");
    await appendFile(join(bundle, "component", deps.path), " ");
    execFileSync("tar", ["-czf", archive, "package"], { cwd: temporary });
    await assert.rejects(inspectArchive(archive, target), /runtime artifact hash mismatch/i);
    await rm(join(bundle, "component", manifest.component.entryAssembly));
    const offlineApi = new sdk.WshcmApi({ eval: async () => assert.fail("Corrupt extracted bundle reached server") });
    await assert.rejects(
      offlineApi.runtime.ensure(),
      (error) => error instanceof sdk.WshcmRuntimeError && error.status.reason === "ArtifactMismatch",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
