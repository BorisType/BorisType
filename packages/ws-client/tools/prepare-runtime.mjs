import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const dotnetRoot = join(root, "packages/dotnet");

function dotnet(args) {
  try {
    return execFileSync("dotnet", args, { cwd: dotnetRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    throw new Error(
      [
        "Cannot build bundled HCM runtime (the repository .NET SDK is needed only when packing from source).",
        error.message,
        error.stdout?.toString(),
        error.stderr?.toString(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function publish(projectName, directory, assemblyName) {
  const project = join(dotnetRoot, "src", projectName, projectName + ".csproj");
  dotnet([
    "publish",
    project,
    "-c",
    "Release",
    "-p:RestoreLockedMode=true",
    "-p:DebugType=None",
    "-p:GenerateDocumentationFile=false",
    ...(assemblyName ? ["-p:AssemblyName=" + assemblyName] : []),
    // Normal solution/ZIP builds use different debug/documentation options.
    // Their incremental obj/bin outputs must not become this release's DLLs.
    // Keep seed and final helper builds separate as well.
    "--artifacts-path",
    directory + "-build",
    "--output",
    directory,
    "--nologo",
  ]);
}

function descriptor(directory, id) {
  const assembly = join(directory, id + ".dll");
  const metadata = JSON.parse(dotnet([join(dotnetRoot, "tools/AssemblyIdentity/bin/Release/net9.0/AssemblyIdentity.dll"), assembly]));
  if (metadata.id !== id || !metadata.version || !metadata.apiVersion || metadata.targetFramework !== ".NETCoreApp,Version=v9.0")
    throw new Error("Unexpected runtime assembly metadata: " + id);
  const files = readdirSync(directory)
    .sort()
    .map((path) => {
      if (path !== id + ".dll" && path !== id + ".deps.json") throw new Error("Unexpected runtime publish output: " + path);
      const bytes = readFileSync(join(directory, path));
      return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    });
  return {
    id,
    version: metadata.version,
    apiVersion: metadata.apiVersion,
    targetFramework: "net9.0",
    buildId: metadata.buildId,
    entryAssembly: id + ".dll",
    files,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--out" || !args[1]))
    throw new Error("Usage: prepare-runtime.mjs [--out directory]");
  const output = args.length ? resolve(args[1]) : join(root, "packages/ws-client/resources/dotnet");
  const temporary = mkdtempSync(join(tmpdir(), "boristype-runtime-build-"));
  try {
    dotnet(["build", "tools/AssemblyIdentity/AssemblyIdentity.csproj", "-c", "Release", "-p:RestoreLockedMode=true", "--nologo"]);
    // GetAssembly is keyed by simple name. Give every helper build its own real
    // assembly name, rather than renaming a binary whose metadata still collides.
    publish("BorisType.RuntimeBootstrap", join(temporary, "seed"));
    const seed = readFileSync(join(temporary, "seed/BorisType.RuntimeBootstrap.Dev.dll"));
    const helperName = "BorisType.RuntimeBootstrap.B" + createHash("sha256").update(seed).digest("hex");
    const bundle = join(temporary, "bundle");
    publish("BorisType.RuntimeBootstrap", join(bundle, "bootstrap"), helperName);
    publish("BorisType.FileSystem", join(bundle, "component"));
    const manifest = {
      schemaVersion: 1,
      bootstrap: descriptor(join(bundle, "bootstrap"), helperName),
      component: descriptor(join(bundle, "component"), "BorisType.FileSystem"),
    };
    writeFileSync(join(bundle, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    // Publish only a complete bundle. No consumer can see a new manifest before
    // its files exist; failed builds leave the previous complete output intact.
    mkdirSync(dirname(output), { recursive: true });
    const staging = mkdtempSync(join(dirname(output), ".dotnet-bundle-"));
    try {
      for (const kind of ["bootstrap", "component"]) {
        mkdirSync(join(staging, kind));
        for (const file of manifest[kind].files) copyFileSync(join(bundle, kind, file.path), join(staging, kind, file.path));
      }
      copyFileSync(join(bundle, "manifest.json"), join(staging, "manifest.json"));
      rmSync(output, { recursive: true, force: true });
      renameSync(staging, output);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    console.log("Prepared HCM runtime bundle: " + output);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
