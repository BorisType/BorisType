import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));

// A real production publish is required: synthetic descriptors cannot detect a
// wrong simple assembly name, stale MVID or accidental vendor/test dependency.
test("SDK runtime bundle contains only production files with actual PE identity", { timeout: 240_000 }, () => {
  const temporary = mkdtempSync(join(tmpdir(), "boristype-runtime-bundle-"));
  try {
    const output = join(temporary, "bundle space");
    const result = spawnSync(process.execPath, [join(root, "packages/ws-client/tools/prepare-runtime.mjs"), "--out", output], {
      encoding: "utf8",
      timeout: 180_000,
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
    assert.equal(manifest.schemaVersion, 1);
    assert.match(manifest.bootstrap.id, /^BorisType\.RuntimeBootstrap\.B[a-f0-9]{64}$/);
    assert.equal(manifest.bootstrap.apiVersion, 1);
    assert.equal(manifest.component.id, "BorisType.FileSystem");
    assert.equal(manifest.component.apiVersion, 2);
    for (const kind of ["bootstrap", "component"]) {
      const descriptor = manifest[kind];
      assert.equal(descriptor.targetFramework, "net9.0");
      assert.deepEqual(readdirSync(join(output, kind)).sort(), descriptor.files.map((f) => f.path).sort());
      assert.deepEqual(descriptor.files.map((f) => f.path).sort(), [descriptor.id + ".deps.json", descriptor.id + ".dll"].sort());
      for (const file of descriptor.files) {
        const bytes = readFileSync(join(output, kind, file.path));
        assert.equal(file.bytes, bytes.length);
        assert.equal(file.sha256, createHash("sha256").update(bytes).digest("hex"));
      }
      const identity = JSON.parse(
        execFileSync(
          "dotnet",
          [
            join(root, "packages/dotnet/tools/AssemblyIdentity/bin/Release/net9.0/AssemblyIdentity.dll"),
            join(output, kind, descriptor.entryAssembly),
          ],
          { encoding: "utf8", timeout: 30_000 },
        ),
      );
      assert.equal(descriptor.id, identity.id);
      assert.equal(descriptor.buildId, identity.buildId);
      assert.equal(descriptor.version, identity.version);
      assert.equal(descriptor.apiVersion, identity.apiVersion);
      assert.equal(identity.targetFramework, ".NETCoreApp,Version=v9.0");
    }
    // A release may be rebuilt from another checkout. Otherwise identical
    // sources must not yield a new MVID and a same-version install conflict.
    const relocated = join(temporary, "another checkout");
    for (const relative of [
      "packages/dotnet/src/BorisType.FileSystem",
      "packages/dotnet/src/BorisType.RuntimeBootstrap",
      "packages/dotnet/tools/AssemblyIdentity",
    ]) {
      cpSync(join(root, relative), join(relocated, relative), {
        recursive: true,
        filter: (path) => !["bin", "obj"].includes(basename(path)),
      });
    }
    for (const relative of [
      "global.json",
      "packages/dotnet/Directory.Build.props",
      "packages/dotnet/Directory.Packages.props",
      "packages/ws-client/tools/prepare-runtime.mjs",
    ]) {
      mkdirSync(dirname(join(relocated, relative)), { recursive: true });
      copyFileSync(join(root, relative), join(relocated, relative));
    }
    const repeatedOutput = join(temporary, "relocated bundle");
    const repeated = spawnSync(
      process.execPath,
      [join(relocated, "packages/ws-client/tools/prepare-runtime.mjs"), "--out", repeatedOutput],
      { encoding: "utf8", timeout: 180_000 },
    );
    assert.equal(repeated.status, 0, repeated.stderr + repeated.stdout);
    assert.deepEqual(JSON.parse(readFileSync(join(repeatedOutput, "manifest.json"), "utf8")), manifest);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
