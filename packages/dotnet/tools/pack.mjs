import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../", import.meta.url));

/** Escape MSBuild syntax in property values independently of shell argument handling. */
function property(name, value) {
  const escaped = value.replace(/[%*?@$();,']/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `-p:${name}=${escaped}`;
}

/** Run the SDK directly, preserving its diagnostic output on failure. */
function dotnet(args) {
  try {
    return execFileSync("dotnet", args, {
      cwd: workspace,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: "pipe",
    });
  } catch (error) {
    throw new Error([error.message, error.stdout?.toString(), error.stderr?.toString()].filter(Boolean).join("\n"));
  }
}

/** Hash the published files before adding the manifest itself. */
function inventory(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return inventory(root, file);
    if (!entry.isFile()) throw new Error(`Unexpected non-file in publish output: ${entry.name}`);
    const bytes = readFileSync(file);
    return [
      { path: relative(root, file).split(sep).join("/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
    ];
  });
}

/** Publish one production project and emit its installation ZIP location as JSON. */
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--out" || !args[1])) {
    throw new Error("Usage: node tools/pack.mjs [--out directory]");
  }
  const output = args.length ? resolve(args[1]) : join(workspace, "dist");
  const project = join(workspace, "src", "BorisType.FileSystem", "BorisType.FileSystem.csproj");
  const properties = JSON.parse(
    dotnet(["msbuild", project, "-getProperty:AssemblyName,Version,TargetFramework,BorisTypeApiVersion", "-nologo"]),
  ).Properties;
  const staging = mkdtempSync(join(tmpdir(), "boristype-dotnet-publish-"));
  try {
    dotnet(["publish", project, "--configuration", "Release", "-p:RestoreLockedMode=true", "--output", staging, "--nologo"]);
    const files = inventory(staging).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const manifest = {
      schemaVersion: 1,
      id: properties.AssemblyName,
      version: properties.Version,
      apiVersion: Number(properties.BorisTypeApiVersion),
      targetFramework: properties.TargetFramework,
      entryAssembly: `${properties.AssemblyName}.dll`,
      files,
    };
    writeFileSync(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    mkdirSync(output, { recursive: true });
    const archive = join(output, `${properties.AssemblyName}-${properties.Version}.zip`);
    dotnet([
      "msbuild",
      join(workspace, "tools", "Archive.proj"),
      property("SourceDirectory", staging),
      property("ArchiveFile", archive),
      "-nologo",
    ]);
    console.log(JSON.stringify({ archive }));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
