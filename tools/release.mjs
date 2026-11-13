import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import semver from "semver";
import { npmRegistry, registryPackage, retryRegistryRead, verifyPublication, waitForDependencies } from "./npm-registry.mjs";
import { uploadReceipt, uploadMode, receiptArtifactIds, assertRestoredReceipts, readReceipts, performUpload } from "./release-recovery.mjs";

export { registryPackage } from "./npm-registry.mjs";

const exec = promisify(execFile);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const registry = npmRegistry;
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

export function publicationMode(target, bytes, context, receipts, metadata) {
  const mode = uploadMode(target, bytes, context, receipts);
  if (metadata?.versions?.[target.version]) {
    publicationState(target, bytes, metadata);
    return "verify";
  }
  if (mode === "verify") return mode;
  publicationState(target, bytes, metadata);
  return "upload";
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

async function run(command, args, cwd, { stream = false } = {}) {
  const pending = exec(command, args, { cwd, maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60_000 });
  if (stream) {
    pending.child.stdout.pipe(process.stdout);
    pending.child.stderr.pipe(process.stderr);
  }
  const result = await pending;
  if (!stream) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  }
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
      // A separate, unprivileged job waits for installability and verifies archive bytes.
      "--publish-wait-timeout=0",
      ...(dryRun ? ["--dry-run"] : []),
    ],
    root,
    { stream: true },
  );
}

async function dependenciesAvailable(root, manifest, timeoutMs) {
  const workspace = new Map(
    await Promise.all(
      Object.entries(directories).map(async ([name, dir]) => [name, JSON.parse(await readFile(join(root, dir, "package.json"), "utf8"))]),
    ),
  );
  const dependencies = internalDependencies(manifest, workspace);
  await waitForDependencies(dependencies, {
    timeoutMs,
    onWait: progress(`Waiting for dependencies: ${dependencies.map((d) => `${d.name}@${d.version}`).join(", ")}`),
  });
}

function progress(label) {
  return ({ remainingMs, error }) => console.log(`${label}; ${Math.ceil(remainingMs / 1000)}s remaining${error ? ` (${error})` : ""}`);
}

async function output(values) {
  const text = Object.entries(values)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, text);
  process.stdout.write(text);
}

async function summary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n\n`);
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
  const [command, tag, artifactPath, statePath] = process.argv.slice(2);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const target = await readRelease(root, tag);
  if (process.env.GITHUB_ACTIONS === "true") await verifyReleaseCommit(root, process.env.GITHUB_SHA, tag, "origin/main", "origin");
  if (command === "validate") {
    const output = `name=${target.name}\ndirectory=${target.directory}\nchannel=${target.channel}\n`;
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
    process.stdout.write(output);
    return;
  }
  if (!["pack", "smoke", "receipt-ids", "plan-upload", "upload", "verify"].includes(command) || !artifactPath)
    throw new Error(
      "Usage: release.mjs validate|pack|smoke|receipt-ids|plan-upload|upload|verify <tag> [artifact-directory] [state-directory]",
    );
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
  if (command === "smoke") {
    await dependenciesAvailable(root, manifest);
    return smoke(root, archive, target);
  }
  if (command === "verify") {
    await verifyPublication(target, bytes, { onWait: progress(`Waiting for ${target.name}@${target.version}`) });
    await summary(
      `Verified ${target.name}@${target.version}: install metadata and downloaded archive match SHA512 ${digest}. Dist-tags left unchanged.`,
    );
    return;
  }
  if (!statePath) throw new Error("Expected publication state directory");
  const state = resolve(statePath);
  if (command === "receipt-ids") {
    const pages = JSON.parse(await readFile(join(state, "artifacts.json"), "utf8"));
    const jobPages = JSON.parse(await readFile(join(state, "jobs.json"), "utf8"));
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page.artifacts))) throw new Error("Invalid run artifact response");
    if (!Array.isArray(jobPages) || jobPages.some((page) => !Array.isArray(page.jobs))) throw new Error("Invalid run job response");
    await output({
      ids: receiptArtifactIds(
        pages.flatMap((page) => page.artifacts),
        jobPages.flatMap((page) => page.jobs),
        Number(process.env.GITHUB_RUN_ATTEMPT),
      ).join(","),
    });
    return;
  }
  const context = { commit: process.env.GITHUB_SHA, attempt: Number(process.env.GITHUB_RUN_ATTEMPT) };
  if (command === "plan-upload") {
    const receipts = await readReceipts(join(state, "prior"));
    const pages = JSON.parse(await readFile(join(state, "artifacts.json"), "utf8"));
    assertRestoredReceipts(
      pages.flatMap((page) => page.artifacts),
      receipts,
    );
    const metadata = await retryRegistryRead((remaining) => registryPackage(target.name, registry, remaining), {
      timeoutMs: 120_000,
      onWait: progress("Checking previous publication"),
    });
    const mode = publicationMode(target, bytes, context, receipts, metadata);
    if (mode === "upload") {
      await dependenciesAvailable(root, manifest, 120_000);
      await writeFile(join(state, "upload-intent.json"), JSON.stringify(uploadReceipt(target, bytes, context)));
    }
    await output({ mode });
    await summary(
      `${target.name}@${target.version}: ${mode === "upload" ? "ready for one upload attempt" : "resume verification without uploading"}.`,
    );
    return;
  }
  const intent = JSON.parse(await readFile(join(state, "upload-intent.json"), "utf8"));
  const expected = uploadReceipt(target, bytes, context);
  if (JSON.stringify(intent) !== JSON.stringify(expected) || process.env.RELEASE_INTENT_STORED !== "true")
    throw new Error("Upload requires the exact durable intent artifact from this attempt");
  const status = await performUpload(target, bytes, context, state, () => publishTarball(root, archive, target));
  await summary(`${target.name}@${target.version}: upload ${status}; availability will be checked without another upload.`);
  if (status === "unknown")
    console.log("::warning::Upload result uncertain. Only verification may be retried until the registry outcome is known.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
