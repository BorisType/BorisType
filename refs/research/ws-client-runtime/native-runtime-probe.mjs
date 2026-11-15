// Opt-in local C-runtime acceptance. Requires the prepared SDK bundle and local
// .NET SDK. Builds fresh-named fixtures in a temporary directory; never replaces the
// stand's FileSystem.dll and never restarts its process. Loaded fixture assemblies
// remain in the host until a normal restart; disk cleanup is separate and explicit.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WshcmClient, WshcmApi, WshcmRuntimeError } from "../../../packages/ws-client/build/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const { WSHCM_HOST: host, WSHCM_USER: username, WSHCM_PASSWORD: password } = process.env;
if (!host || !username || !password) throw new Error("Set WSHCM_HOST, WSHCM_USER and WSHCM_PASSWORD for the authorized local stand");
const runId = randomUUID().replaceAll("-", "");
const installationName = ".boristype-runtime-fixture-" + runId;
const componentName = "BorisType.RuntimeFixture.Native" + runId;
const temporary = await mkdtemp(join(tmpdir(), "boristype-native-runtime-"));
const baseBundle = join(root, "packages/ws-client/resources/dotnet");
const baseManifest = JSON.parse(await readFile(join(baseBundle, "manifest.json"), "utf8"));
const evaluatorHashes = [];
const client = new WshcmClient({
  host,
  port: Number(process.env.WSHCM_PORT ?? 80),
  overHttps: false,
  username,
  password,
  requestTimeout: 15000,
});
await client.initialize();
const evaluator = client.createEvaluator();
let closed = false;
try {
  await evaluator.initialize();
  assert.equal(await evaluator.evalExpr("2 + 2"), 4);
  async function apiFor(name) {
    const directory = join(temporary, name);
    await mkdir(join(directory, "component"), { recursive: true });
    await cp(join(baseBundle, "bootstrap"), join(directory, "bootstrap"), { recursive: true });
    // A fresh simple name prevents a previous probe/build from occupying this
    // host's ALC cache. Renaming only the file would not change assembly identity.
    const project = name === "v1" ? "V1" : "V2";
    const compiled = join(temporary, "compiled", name);
    execFileSync(
      "dotnet",
      [
        "publish",
        join(root, "packages/dotnet/tests/BorisType.RuntimeBootstrap.Tests/Fixtures", project, project + ".csproj"),
        "-c",
        "Release",
        "-p:RestoreLockedMode=true",
        "-p:AssemblyName=" + componentName,
        "--output",
        compiled,
        "--nologo",
      ],
      { cwd: root, stdio: "pipe", timeout: 120000 },
    );
    const path = join(compiled, componentName + ".dll");
    const bytes = await readFile(path);
    const metadata = JSON.parse(
      execFileSync("dotnet", [join(root, "packages/dotnet/tools/AssemblyIdentity/bin/Release/net9.0/AssemblyIdentity.dll"), path], {
        encoding: "utf8",
      }),
    );
    const component = {
      id: metadata.id,
      version: metadata.version,
      apiVersion: metadata.apiVersion,
      targetFramework: "net9.0",
      buildId: metadata.buildId,
      entryAssembly: metadata.id + ".dll",
      files: [{ path: metadata.id + ".dll", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }],
    };
    await writeFile(join(directory, "component", component.entryAssembly), bytes);
    await writeFile(join(directory, "manifest.json"), JSON.stringify({ ...baseManifest, component }));
    return new WshcmApi(
      {
        eval: async (code) => {
          evaluatorHashes.push(createHash("sha256").update(code).digest("hex"));
          return evaluator.eval(code);
        },
      },
      { bundleDirectory: directory, installationName },
    );
  }
  const firstApi = await apiFor("v1");
  const first = await firstApi.runtime.ensure();
  console.log(JSON.stringify({ phase: "ensure-v1", status: first }));
  assert.equal(first.status, "ready");
  assert.equal(first.loaded.buildId, first.expected.buildId);
  const marker = await evaluator.eval(
    "return tools.dotnet_host.Object.GetAssembly('" +
      componentName +
      ".dll').CallClassStaticMethod('BorisType.RuntimeFixture.Marker', 'Value', []);",
  );
  assert.equal(marker, "first");
  const current = await firstApi.runtime.ensure();
  assert.equal(current.status, "ready");
  const nextApi = await apiFor("v2");
  const next = await nextApi.runtime.ensure();
  console.log(JSON.stringify({ phase: "cached-old-update", status: next }));
  assert.equal(next.status, "restart_required");
  assert.equal(next.loaded.buildId, first.loaded.buildId);
  assert.equal(next.installed.buildId, next.expected.buildId);
  await assert.rejects(
    nextApi.files.info({ path: "x-local://wt" }),
    (error) => error instanceof WshcmRuntimeError && error.status.status === "restart_required",
  );
  const query = JSON.parse(await nextApi.xquery({ query: "sql: SELECT 1 AS bt_runtime_probe" }));
  assert.equal(query.returnedRows, 1);
  console.log(JSON.stringify({ result: "PASS", installationName, independentXquery: true, evaluatorHashes, bundle: baseManifest }));
} finally {
  closed = await evaluator.close();
  await rm(temporary, { recursive: true, force: true });
  console.log(JSON.stringify({ evaluatorCleanup: closed ? "confirmed" : "unconfirmed", serverRootCleanup: "required", installationName }));
  if (!closed) throw new Error("Evaluator cleanup unconfirmed; inspect stand before retrying");
}
