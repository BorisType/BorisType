import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Catches incomplete ZIPs, wrong project selection, stale manifests and accidental
// inclusion of vendor/probe/test assemblies by checking the published artifact.
test("installation ZIP contains the standalone library and verifiable manifest", { timeout: 120_000 }, () => {
  const temporary = mkdtempSync(join(tmpdir(), "boristype-dotnet-package-"));
  try {
    // Legal on Windows and Linux; exercises MSBuild property separators and escapes.
    const output = join(temporary, "output space,semi;literal%20");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../tools/pack.mjs", import.meta.url)), "--out", output], {
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const { archive } = JSON.parse(result.stdout);
    assert.equal(archive, join(output, basename(archive)));
    assert.match(basename(archive), /^BorisType\.FileSystem-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.zip$/);
    // Copy the actual artifact so this harness needs no copy of the producer's escaping logic.
    const extractionArchive = join(temporary, "artifact.zip");
    copyFileSync(archive, extractionArchive);
    const extracted = join(temporary, "extracted");
    execFileSync(
      "dotnet",
      [
        "msbuild",
        fileURLToPath(new URL("../tools/Archive.proj", import.meta.url)),
        "-target:Extract",
        `-p:ArchiveFile=${extractionArchive}`,
        `-p:ExtractDirectory=${extracted}`,
        "-nologo",
      ],
      { timeout: 30_000, stdio: "pipe" },
    );
    const manifest = JSON.parse(readFileSync(join(extracted, "manifest.json"), "utf8"));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.id, "BorisType.FileSystem");
    assert.equal(manifest.apiVersion, 1);
    assert.equal(manifest.targetFramework, "net9.0");
    assert.equal(manifest.entryAssembly, "BorisType.FileSystem.dll");
    assert.equal(basename(archive), `BorisType.FileSystem-${manifest.version}.zip`);
    const expected = ["BorisType.FileSystem.deps.json", "BorisType.FileSystem.dll", "BorisType.FileSystem.pdb", "BorisType.FileSystem.xml"];
    assert.deepEqual(readdirSync(extracted).sort(), [...expected, "manifest.json"].sort());
    assert.deepEqual(
      manifest.files.map((entry) => entry.path),
      expected,
    );
    for (const entry of manifest.files) {
      const bytes = readFileSync(join(extracted, entry.path));
      assert.equal(entry.bytes, bytes.length, entry.path);
      assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"), entry.path);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
