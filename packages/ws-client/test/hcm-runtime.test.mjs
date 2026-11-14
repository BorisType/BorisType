import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as sdk from "../build/index.js";
import { runtimeTransport } from "./helpers/runtime-transport.mjs";

async function bundle(t) {
  const directory = await mkdtemp(join(tmpdir(), "boristype-runtime-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const descriptor = (id, bytes, buildId) => ({
    id,
    version: "0.1.0-alpha.4",
    apiVersion: 2,
    targetFramework: "net9.0",
    buildId,
    entryAssembly: `${id}.dll`,
    files: [{ path: `${id}.dll`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }],
  });
  const bootstrapBytes = Buffer.from("bootstrap fixture bytes");
  const componentBytes = Buffer.from("component fixture bytes");
  const manifest = {
    schemaVersion: 1,
    bootstrap: descriptor(`BorisType.RuntimeBootstrap.B${"a".repeat(64)}`, bootstrapBytes, "11111111-1111-4111-8111-111111111111"),
    component: descriptor("BorisType.FileSystem", componentBytes, "22222222-2222-4222-8222-222222222222"),
  };
  const bootstrapDeps = Buffer.from('{"runtimeTarget":{"name":".NETCoreApp,Version=v9.0"}}');
  manifest.bootstrap.files.push({
    path: `${manifest.bootstrap.id}.deps.json`,
    bytes: bootstrapDeps.length,
    sha256: createHash("sha256").update(bootstrapDeps).digest("hex"),
  });
  for (const [kind, bytes] of [
    ["bootstrap", bootstrapBytes],
    ["component", componentBytes],
  ]) {
    await mkdir(join(directory, kind));
    await writeFile(join(directory, kind, manifest[kind].entryAssembly), bytes);
  }
  await writeFile(join(directory, "bootstrap", `${manifest.bootstrap.id}.deps.json`), bootstrapDeps);
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  return { directory, manifest, bootstrapBytes, componentBytes };
}

test("runtime automatically stages verified package assets before loading the helper", async (t) => {
  const fixture = await bundle(t);
  const transport = runtimeTransport();
  const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
  const status = await runtime.requireReady();
  assert.equal(status.status, "ready");
  assert.equal(status.process.pid, 41);
  assert.equal(status.loaded.buildId, fixture.manifest.component.buildId);
  assert.deepEqual(transport.calls, ["bootstrap", "operation", "EnsureJson"]);
  assert.equal(transport.files.size, 2);
  assert.deepEqual([...transport.files.values()][0], fixture.bootstrapBytes);
  await runtime.ensure();
  assert.deepEqual(transport.calls, ["bootstrap", "operation", "EnsureJson", "operation", "InspectJson"]);
});

test("runtime rejects corrupt bundled files before any platform evaluation", async (t) => {
  assert.equal(typeof sdk.WshcmRuntime, "function", "WshcmRuntime must be exported");
  const fixture = await bundle(t);
  await writeFile(join(fixture.directory, "component", fixture.manifest.component.entryAssembly), "corrupt");
  const runtime = new sdk.WshcmRuntime(
    { eval: async () => assert.fail("Corrupt bundle reached evaluator") },
    { bundleDirectory: fixture.directory },
  );
  await assert.rejects(runtime.ensure(), (error) => {
    assert.ok(error instanceof sdk.WshcmRuntimeError);
    assert.equal(error.status.status, "blocked");
    assert.equal(error.status.reason, "ArtifactMismatch");
    assert.equal(error.status.process, null);
    return true;
  });
});

for (const kind of ["bootstrap", "component"]) {
  test(`missing ${kind} package file fails before touching HCM`, async (t) => {
    const fixture = await bundle(t);
    await rm(join(fixture.directory, kind, fixture.manifest[kind].entryAssembly));
    const runtime = new sdk.WshcmRuntime(
      { eval: async () => assert.fail("Missing asset reached evaluator") },
      { bundleDirectory: fixture.directory },
    );
    await assert.rejects(runtime.ensure(), (error) => error instanceof sdk.WshcmRuntimeError && error.status.reason === "ArtifactMismatch");
  });
}

test("missing manifest produces a local blocked status with no fabricated server identity", async (t) => {
  const fixture = await bundle(t);
  await rm(join(fixture.directory, "manifest.json"));
  const runtime = new sdk.WshcmRuntime(
    { eval: async () => assert.fail("Missing manifest reached evaluator") },
    { bundleDirectory: fixture.directory },
  );
  await assert.rejects(
    runtime.ensure(),
    (error) => error.status.reason === "InvalidBundle" && error.status.process === null && error.status.expected === null,
  );
});

for (const failure of ["corruptReadback", "lostResponse", "uploadError"]) {
  test(`helper ${failure} never loads an unverified assembly or retries automatically`, async (t) => {
    const fixture = await bundle(t);
    const transport = runtimeTransport(undefined, {
      uploadError: failure === "uploadError",
      afterBootstrap: (wire) => {
        if (failure === "lostResponse") throw new Error("Lost bootstrap response");
        if (failure === "corruptReadback") {
          const data = JSON.parse(JSON.parse(wire));
          data.files[fixture.manifest.bootstrap.entryAssembly] = Buffer.from("corrupt").toString("base64");
          return JSON.stringify(JSON.stringify(data));
        }
        return wire;
      },
    });
    const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
    await assert.rejects(
      runtime.ensure(),
      (error) => error instanceof sdk.WshcmRuntimeError && error.status.status === "blocked" && error.status.process === null,
    );
    assert.deepEqual(transport.calls, ["bootstrap"]);
  });
}

test("a corrupt existing immutable helper is rejected without overwriting it", async (t) => {
  const fixture = await bundle(t);
  const transport = runtimeTransport();
  const helperPath = `/WebsoftServer/dotnetcore/shared/.boristype-runtime/bootstrap/${fixture.manifest.bootstrap.id}/${fixture.manifest.bootstrap.entryAssembly}`;
  const corrupt = Buffer.from("corrupt installed helper");
  transport.files.set(helperPath, corrupt);
  const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
  await assert.rejects(runtime.ensure(), (error) => error.status.reason === "BootstrapArtifactMismatch");
  assert.deepEqual(transport.files.get(helperPath), corrupt);
  assert.deepEqual(transport.calls, ["bootstrap"]);
});

test("concurrent runtime preparations coalesce, while later calls recheck the process", async (t) => {
  const fixture = await bundle(t);
  const transport = runtimeTransport();
  const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
  const results = await Promise.all([runtime.ensure(), runtime.ensure(), runtime.requireReady()]);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(transport.calls, ["bootstrap", "operation", "EnsureJson"]);
  await runtime.requireReady();
  assert.deepEqual(transport.calls.slice(-2), ["operation", "InspectJson"]);
});

test("stale loaded identity blocks files and recovers after an actual process identity change", async (t) => {
  const fixture = await bundle(t);
  let restarted = false;
  const transport = runtimeTransport(() => assert.fail("Stale runtime reached file operation"), {
    status: ({ status }) =>
      restarted
        ? status
        : {
            ...status,
            status: "restart_required",
            reason: "LoadedBuildMismatch",
            loaded: { ...status.loaded, buildId: "33333333-3333-4333-8333-333333333333" },
          },
  });
  const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
  await assert.rejects(
    runtime.requireReady(),
    (error) => error.status.status === "restart_required" && error.status.loaded.buildId !== error.status.installed.buildId,
  );
  restarted = true;
  transport.process.pid = 42;
  transport.process.startedAt = "2026-11-14T12:00:00.0000000Z";
  const status = await runtime.requireReady();
  assert.equal(status.process.pid, 42);
  assert.equal(status.loaded.buildId, fixture.manifest.component.buildId);
  assert.deepEqual(transport.calls.slice(-2), ["operation", "InspectJson"]);
});

for (const state of ["missing", "installed", "restart_required"]) {
  test(`a later ${state} state prepares missing component bytes before returning status`, async (t) => {
    const fixture = await bundle(t);
    const transport = runtimeTransport(undefined, {
      status: ({ method, status }) =>
        method === "InspectJson"
          ? {
              ...status,
              status: state,
              reason: "NotInstalled",
              installed: null,
              loaded: state === "restart_required" ? { ...status.loaded, buildId: "33333333-3333-4333-8333-333333333333" } : null,
            }
          : status,
    });
    const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
    await runtime.requireReady();
    assert.equal((await runtime.ensure()).status, "ready");
    assert.deepEqual(transport.calls.slice(-4), ["operation", "InspectJson", "operation", "EnsureJson"]);
  });
}

for (const [label, mutate] of [
  ["missing process", (status) => ({ ...status, process: null })],
  ["missing loaded identity", (status) => ({ ...status, loaded: null })],
  ["wrong loaded build", (status) => ({ ...status, loaded: { ...status.loaded, buildId: "33333333-3333-4333-8333-333333333333" } })],
  ["wrong expected identity", (status) => ({ ...status, expected: { ...status.expected, id: "BorisType.Other" } })],
]) {
  test(`malformed ready status cannot authorize a file operation: ${label}`, async (t) => {
    const fixture = await bundle(t);
    const transport = runtimeTransport(undefined, { status: ({ status }) => mutate(status) });
    const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
    await assert.rejects(
      runtime.requireReady(),
      (error) => error.status.reason === "RuntimeTransportError" && error.status.process === null,
    );
  });
}

test("lost managed response is not retried and explicit subsequent ensure can recover", async (t) => {
  const fixture = await bundle(t);
  let lost = true;
  const transport = runtimeTransport(undefined, {
    status: ({ status }) => {
      if (lost) throw new Error("Lost helper response");
      return status;
    },
  });
  const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
  await assert.rejects(runtime.ensure(), (error) => error.status.reason === "RuntimeTransportError");
  assert.deepEqual(transport.calls, ["bootstrap", "operation", "EnsureJson"]);
  lost = false;
  assert.equal((await runtime.ensure()).status, "ready");
  assert.deepEqual(transport.calls.slice(-3), ["bootstrap", "operation", "EnsureJson"]);
});

test("custom installation names stay under dotnetcore/shared and traversal is rejected locally", async (t) => {
  const fixture = await bundle(t);
  const transport = runtimeTransport(undefined, { installationName: ".boristype-fixture" });
  const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory, installationName: ".boristype-fixture" });
  assert.equal((await runtime.ensure()).status, "ready");
  const invalid = new sdk.WshcmRuntime(
    { eval: async () => assert.fail("Traversal reached HCM") },
    { bundleDirectory: fixture.directory, installationName: "../escape" },
  );
  await assert.rejects(invalid.ensure(), (error) => error.status.reason === "InvalidInstallationName");
});

test("older hyphenated prerelease cannot masquerade as a ready build", async (t) => {
  const fixture = await bundle(t);
  fixture.manifest.component.version = "0.1.0-alpha-2";
  await writeFile(join(fixture.directory, "manifest.json"), JSON.stringify(fixture.manifest));
  const transport = runtimeTransport(undefined, {
    status: ({ status }) => ({ ...status, loaded: { ...status.loaded, version: "0.1.0-alpha-1" } }),
  });
  const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
  await assert.rejects(runtime.requireReady(), (error) => error.status.reason === "RuntimeTransportError");
});

test("file API gates stale assemblies while XQuery and XML remain available", async (t) => {
  const fixture = await bundle(t);
  let independentCalls = 0;
  const transport = runtimeTransport(
    (script) => {
      independentCalls++;
      if (script.includes("XQuery(")) return JSON.stringify('{"rows":[],"returnedRows":0,"truncated":false,"limitReason":null}');
      return JSON.stringify(
        JSON.stringify({ ok: true, formUrl: "x-local://wtv/wtv_cost_center.xmd", root: "cost_center", xml: "<cost_center/>" }),
      );
    },
    {
      status: ({ status }) => ({
        ...status,
        status: "restart_required",
        reason: "LoadedBuildMismatch",
        loaded: { ...status.loaded, buildId: "33333333-3333-4333-8333-333333333333" },
      }),
    },
  );
  const api = new sdk.WshcmApi(transport, { bundleDirectory: fixture.directory });
  await assert.rejects(api.files.info({ path: "x-local://wt/data.bs" }), (error) => error.status.status === "restart_required");
  assert.equal(independentCalls, 0);
  const handshakeCalls = transport.calls.length;
  assert.equal(await api.xquery({ query: "query" }), '{"rows":[],"returnedRows":0,"truncated":false,"limitReason":null}');
  assert.equal((await api.objects.getForm({ formUrl: "x-local://wtv/wtv_cost_center.xmd" })).root, "cost_center");
  assert.equal(independentCalls, 2);
  assert.equal(transport.calls.length, handshakeCalls);
});

test("invalid file input does not trigger a handshake even when bundled assets are missing", async (t) => {
  const fixture = await bundle(t);
  await rm(join(fixture.directory, "manifest.json"));
  const api = new sdk.WshcmApi(
    { eval: async () => assert.fail("Invalid file input reached handshake") },
    { bundleDirectory: fixture.directory },
  );
  await assert.rejects(api.files.read({ path: "file:///tmp" }), (error) => !(error instanceof sdk.WshcmRuntimeError));
  const json = '{"rows":[],"returnedRows":0,"truncated":false,"limitReason":null}';
  const independent = new sdk.WshcmApi({ eval: async () => JSON.stringify(json) }, { bundleDirectory: fixture.directory });
  assert.equal(await independent.xquery({ query: "query" }), json);
});

test("runtime identities accept canonical MVID GUIDs without imposing UUID version bits", async (t) => {
  const fixture = await bundle(t);
  fixture.manifest.component.buildId = "11111111-1111-0111-7111-111111111111";
  await writeFile(join(fixture.directory, "manifest.json"), JSON.stringify(fixture.manifest));
  const transport = runtimeTransport();
  const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
  assert.equal((await runtime.requireReady()).loaded.buildId, fixture.manifest.component.buildId);
});

test("generic custom runtime bundles cannot authorize FileSystem API calls", async (t) => {
  const fixture = await bundle(t);
  const originalPath = join(fixture.directory, "component", fixture.manifest.component.entryAssembly);
  fixture.manifest.component.id = "BorisType.Other";
  fixture.manifest.component.entryAssembly = "BorisType.Other.dll";
  fixture.manifest.component.files[0].path = "BorisType.Other.dll";
  await writeFile(join(fixture.directory, "component", "BorisType.Other.dll"), fixture.componentBytes);
  await rm(originalPath);
  await writeFile(join(fixture.directory, "manifest.json"), JSON.stringify(fixture.manifest));
  const transport = runtimeTransport(() => assert.fail("Unrelated component authorized file RPC"));
  const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
  assert.equal((await runtime.requireReady()).status, "ready");
  const api = new sdk.WshcmApi(transport, { bundleDirectory: fixture.directory });
  await assert.rejects(
    api.files.info({ path: "x-local://wt/data.bs" }),
    (error) => error instanceof sdk.WshcmRuntimeError && error.status.status === "blocked" && error.status.reason === "UnexpectedComponent",
  );
});

// Native C-runtime rejects a repeated var declaration on the second loop iteration.
// This target-language restriction is not reproduced by JavaScript VM semantics.
test("bootstrap declares loop temporaries once for multi-file BorisScript bundles", async () => {
  const template = await readFile(new URL("../resources/runtime-bootstrap.bs", import.meta.url), "utf8");
  const loopBody = template.slice(template.indexOf("{", template.indexOf("for (")) + 1);
  assert.doesNotMatch(loopBody, /\bvar\s+/);
});

for (const installationName of ["native", "runtimes", "refs"]) {
  test(`loader-reserved installation name is rejected locally: ${installationName}`, async (t) => {
    const fixture = await bundle(t);
    const runtime = new sdk.WshcmRuntime(
      { eval: async () => assert.fail("Reserved loader path reached HCM") },
      { bundleDirectory: fixture.directory, installationName },
    );
    await assert.rejects(runtime.ensure(), (error) => error.status.reason === "InvalidInstallationName");
  });
}

for (const apiVersion of [0, 500]) {
  test(`incompatible foreign loaded identity preserves diagnostics for API ${apiVersion}`, async (t) => {
    const fixture = await bundle(t);
    const foreignMvid = "aaaaaaaa-aaaa-0aaa-7aaa-aaaaaaaaaaaa";
    const transport = runtimeTransport(undefined, {
      status: ({ status }) => ({
        ...status,
        status: "blocked",
        reason: "IncompatibleApi",
        loaded: { ...status.loaded, apiVersion, version: "1.0.0.0", buildId: foreignMvid },
      }),
    });
    const runtime = new sdk.WshcmRuntime(transport, { bundleDirectory: fixture.directory });
    const status = await runtime.ensure();
    assert.equal(status.status, "blocked");
    assert.equal(status.reason, "IncompatibleApi");
    assert.equal(status.process.pid, 41);
    assert.equal(status.loaded.apiVersion, apiVersion);
    assert.equal(status.loaded.version, "1.0.0.0");
    assert.equal(status.loaded.buildId, foreignMvid);
  });
}
