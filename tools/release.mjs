import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import semver from "semver";

const exec = promisify(execFile);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const registry = "https://registry.npmjs.org";
const directories = {
  "@boristype/bt-cli": "packages/bt-cli",
  "@boristype/bt-ir": "packages/bt-ir",
  "@boristype/runtime": "packages/builtin-runtime",
  "@boristype/eslint-plugin": "packages/eslint-plugin",
  "@boristype/ws-client": "packages/ws-client",
  "@boristype/ws-version": "packages/ws-version",
  "@boristype/mcp-server": "packages/mcp-server",
};

export function parseReleaseTag(tag) {
  const match = /^(@boristype\/[a-z-]+)@([^\s]+)$/.exec(tag);
  if (!match || !Object.hasOwn(directories, match[1])) throw new Error(`Unsupported release tag: ${tag}`);
  const [, name, version] = match;
  // Build metadata does not distinguish npm versions; require a canonical tag.
  if (semver.valid(version) !== version || version.includes("+")) throw new Error(`Invalid release version: ${version}`);
  return { name, version, channel: semver.prerelease(version) ? "next" : "latest", directory: directories[name] };
}

function checkManifest(manifest, target) {
  if (manifest.private) throw new Error("Cannot publish a private package");
  if (manifest.name !== target.name || manifest.version !== target.version) throw new Error("Release tag and package manifest differ");
}

export async function readRelease(root, tag) {
  const target = parseReleaseTag(tag);
  const manifest = JSON.parse(await readFile(join(root, target.directory, "package.json"), "utf8"));
  checkManifest(manifest, target);
  return { ...target, manifest };
}

export async function verifyReleaseCommit(root, sha, tag, main = "origin/main", remote) {
  parseReleaseTag(tag);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Expected a full commit SHA");
  const git = async (...args) => (await exec("git", args, { cwd: root })).stdout.trim();
  const commit = await git("rev-parse", "--verify", `${sha}^{commit}`);
  const tagged = await git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`);
  if (tagged !== commit || (await git("rev-parse", "HEAD")) !== commit)
    throw new Error("Release tag does not point at the checked-out commit");
  try {
    await git("merge-base", "--is-ancestor", commit, main);
  } catch {
    throw new Error("Release commit must belong to main history");
  }
  if (remote) {
    const ref = `refs/tags/${tag}`;
    const remoteRefs = (await git("ls-remote", "--tags", remote, ref)).split("\n");
    const localObject = await git("rev-parse", ref);
    if (!remoteRefs.includes(`${localObject}\t${ref}`)) throw new Error("Remote release tag was removed or moved");
  }
}

export function publicationState(target, bytes, metadata) {
  const existing = metadata?.versions?.[target.version];
  if (existing) {
    const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");
    if (existing.dist?.integrity !== integrity) throw new Error("Published version has different or missing tarball integrity");
    return "exists";
  }
  const current = metadata?.["dist-tags"]?.[target.channel];
  if (current && (!semver.valid(current) || semver.gt(current, target.version)))
    throw new Error(`Refusing to rewind ${target.channel} with an older release`);
  return "publish";
}

export async function publishVerified(target, bytes, upload, lookup = () => registryPackage(target.name)) {
  if (publicationState(target, bytes, await lookup()) === "exists") {
    console.log("Identical version already published; dist-tags left unchanged");
    return;
  }
  let uploadError;
  try {
    await upload();
  } catch (error) {
    uploadError = error;
  }
  // Upload timeouts can happen after npm has accepted the artifact. Never retry the upload blindly.
  for (let attempt = 0; attempt < 6; attempt++) {
    if (publicationState(target, bytes, await lookup()) === "exists") {
      console.log(`Verified npm tarball integrity for ${target.name}@${target.version}`);
      return;
    }
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw uploadError ?? new Error("Published version did not become visible; inspect npm before rerunning");
}

export async function registryPackage(name, base = registry) {
  const response = await fetch(`${base}/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Registry HTTP ${response.status} for ${name}`);
  const data = await response.json();
  if (
    data.name !== name ||
    !data.versions ||
    typeof data.versions !== "object" ||
    !data["dist-tags"] ||
    typeof data["dist-tags"] !== "object"
  )
    throw new Error(`Invalid registry metadata for ${name}`);
  return data;
}

export function internalDependencies(manifest, workspace) {
  const result = new Map();
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (!name.startsWith("@boristype/")) continue;
      const dependency = workspace.get(name);
      if (!dependency || !semver.validRange(range) || !semver.satisfies(dependency.version, range))
        throw new Error(`Invalid packed internal dependency ${name}: ${range}`);
      result.set(name, { name, version: dependency.version });
    }
  }
  return [...result.values()];
}

export async function inspectArchive(archive, target) {
  const { stdout } = await exec("tar", ["-tzf", archive], { maxBuffer: 16 * 1024 * 1024 });
  const entries = stdout
    .trim()
    .split("\n")
    .filter((entry) => !entry.endsWith("/"));
  for (const entry of entries) {
    if (
      entry.split("/").includes("..") ||
      !/^package\/(package\.json|README(?:\.md)?|LICENSE(?:\.md)?|build\/.+|resources\/.+)$/.test(entry)
    )
      throw new Error(`Unexpected archive entry: ${entry}`);
  }
  const manifest = JSON.parse((await exec("tar", ["-xOf", archive, "package/package.json"])).stdout);
  checkManifest(manifest, target);
  if (!entries.some((entry) => entry.startsWith("package/build/"))) throw new Error("Missing build output");
  const bins = typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin ?? {});
  for (const entry of [manifest.main, manifest.types, ...bins].filter(Boolean)) {
    if (!entries.includes(`package/${entry.replace(/^\.\//, "")}`)) throw new Error(`Missing package entry point: ${entry}`);
  }
  return manifest;
}

async function run(command, args, cwd) {
  const result = await exec(command, args, { cwd, maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60_000 });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  return result.stdout;
}

export function publishTarball(root, archive, target, dryRun = false) {
  // CI checks tag identity and main ancestry itself; pnpm rejects detached HEAD otherwise.
  return run(
    pnpm,
    [
      "publish",
      archive,
      "--no-git-checks",
      "--access",
      "public",
      "--tag",
      target.channel,
      "--provenance",
      "--registry",
      registry,
      "--config.ignore-scripts=true",
      "--publish-wait-timeout=120000",
      ...(dryRun ? ["--dry-run"] : []),
    ],
    root,
  );
}

async function dependenciesAvailable(root, manifest) {
  const workspace = new Map(
    await Promise.all(
      Object.entries(directories).map(async ([name, dir]) => [name, JSON.parse(await readFile(join(root, dir, "package.json"), "utf8"))]),
    ),
  );
  for (const dependency of internalDependencies(manifest, workspace)) {
    const metadata = await registryPackage(dependency.name);
    const version = metadata?.versions?.[dependency.version];
    if (!version?.dist?.tarball || !version.dist.integrity)
      throw new Error(`Publish ${dependency.name}@${dependency.version} first; it is not available in npm`);
    const url = new URL(version.dist.tarball);
    if (url.protocol !== "https:" || url.hostname !== "registry.npmjs.org") throw new Error("Unexpected dependency tarball URL");
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Dependency tarball is unavailable: HTTP ${response.status}`);
  }
}

export async function smoke(root, archive, target) {
  const temporary = await mkdtemp(join(tmpdir(), "boristype-release-smoke-"));
  try {
    // Keep the same cooldown, trust, override and lifecycle policies outside the checkout.
    await cp(join(root, "pnpm-workspace.yaml"), join(temporary, "pnpm-workspace.yaml"));
    await cp(join(root, "patches"), join(temporary, "patches"), { recursive: true });
    const peers = {};
    for (const [name, range] of Object.entries(target.manifest.peerDependencies ?? {})) {
      if (target.manifest.peerDependenciesMeta?.[name]?.optional) continue;
      const tested = target.manifest.devDependencies?.[name];
      peers[name] = tested && semver.validRange(tested) && semver.subset(tested, range) ? tested : range;
    }
    await writeFile(
      join(temporary, "package.json"),
      JSON.stringify({ private: true, dependencies: { ...peers, [target.name]: `file:${archive}` } }),
    );
    // A single-package graph may omit saxes; keep every applicable patch without
    // requiring that unrelated workspace packages exist in the consumer install.
    await run(pnpm, ["install", "--ignore-scripts", "--config.allow-unused-patches=true", "--registry", registry], temporary);
    if (target.manifest.bin) {
      const bin = typeof target.manifest.bin === "string" ? target.manifest.bin : Object.values(target.manifest.bin)[0];
      const args = target.name === "@boristype/bt-ir" ? [] : ["--help"];
      await run(process.execPath, [join(temporary, "node_modules", target.name, bin), ...args], temporary);
    } else if (target.manifest.main) {
      await run(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(target.name)})`], temporary);
    } else {
      await run(process.execPath, ["-e", `require.resolve(${JSON.stringify(target.name + "/package.json")})`], temporary);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const [command, tag, artifactPath] = process.argv.slice(2);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const target = await readRelease(root, tag);
  if (process.env.GITHUB_ACTIONS === "true") await verifyReleaseCommit(root, process.env.GITHUB_SHA, tag, "origin/main", "origin");
  if (command === "validate") {
    const output = `name=${target.name}\ndirectory=${target.directory}\nchannel=${target.channel}\n`;
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
    process.stdout.write(output);
    return;
  }
  if (!["pack", "smoke", "publish"].includes(command) || !artifactPath)
    throw new Error("Usage: release.mjs validate|pack|smoke|publish <tag> [artifact-directory]");
  const artifacts = resolve(artifactPath);
  if (command === "pack") {
    await mkdir(artifacts, { recursive: true });
    if ((await readdir(artifacts)).length) throw new Error("Artifact directory must be empty");
    await run(
      pnpm,
      ["pack", "--silent", "--out", join(artifacts, "package.tgz"), "--config.ignore-scripts=true"],
      join(root, target.directory),
    );
  }
  const archive = join(artifacts, "package.tgz");
  const manifest = await inspectArchive(archive, target);
  const bytes = await readFile(archive);
  const digest = createHash("sha512").update(bytes).digest("hex");
  if (command === "pack") {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `sha512=${digest}\n`);
    console.log(`Verified ${target.name}@${target.version}: sha512 ${digest}`);
    return;
  }
  if (process.env.GITHUB_ACTIONS === "true" && digest !== process.env.RELEASE_SHA512)
    throw new Error("Downloaded artifact digest differs from the verified archive");
  await dependenciesAvailable(root, manifest);
  if (command === "smoke") return smoke(root, archive, target);
  await publishVerified(target, bytes, () => publishTarball(root, archive, target));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
