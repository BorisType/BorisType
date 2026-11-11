import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { createMarkdownRenderer } from "vitepress";
import { fileURLToPath } from "node:url";

// No network requests or runtime probes: this checks repository integrity only.
const root = resolve(process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)));
const errors = [];
const git = (...args) => execFileSync("git", ["-C", root, ...args]);
const read = (path) => readFileSync(resolve(root, path), "utf8");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exists = (path) => existsSync(resolve(root, path));
const repositoryLink = /^https:\/\/github\.com\/BorisType\/BorisType\/(?:blob|tree)\/main\/(.+)$/;
let links = 0;
let preserved = 0;

/** Resolve ordinary local links and extensionless VitePress routes. Anchors aren't checked. */
function targetExists(file, target) {
  const repositoryPath = target.match(repositoryLink)?.[1];
  if (repositoryPath) return exists(decodeURIComponent(repositoryPath.split(/[?#]/, 1)[0]));
  const path = decodeURIComponent(target.split(/[?#]/, 1)[0]);
  if (!path) return true;
  const base = path.startsWith("/") ? resolve(root, "docs", `.${path}`) : resolve(root, dirname(file), path);
  const isFile = (path) => existsSync(path) && statSync(path).isFile();
  if (isFile(base)) return true;
  const docsRoot = resolve(root, "docs");
  if (file.startsWith("docs/") && path.startsWith("/") && isFile(resolve(docsRoot, "public", `.${path}`))) return true;
  if (file.startsWith("docs/") && (base === docsRoot || base.startsWith(docsRoot + sep))) {
    return [base + ".md", resolve(base, "index.md")].some(isFile);
  }
  return existsSync(base);
}

const exceptionFile = "refs/link-exceptions.json";
const exceptions = exists(exceptionFile) ? JSON.parse(read(exceptionFile)) : [];
const seenExceptions = new Set();
function checkLink(file, target) {
  if ((/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target) && !repositoryLink.test(target)) || target.startsWith("#")) return;
  links++;
  let found = false;
  try {
    found = targetExists(file, target);
  } catch {
    /* malformed encoding is a broken link */
  }
  const key = `${file}\n${target}`;
  const exception = exceptions.find((item) => item.file === file && item.target === target);
  if (exception) {
    seenExceptions.add(key);
    if (!exception.reason || !file.startsWith("refs/archive/")) errors.push(`Invalid historical link exception: ${file} → ${target}`);
    if (found) errors.push(`Remove resolved link exception: ${file} → ${target}`);
  } else if (!found) errors.push(`Missing link: ${file} → ${target}`);
}

try {
  // Use the site renderer's Markdown parser rather than approximating link grammar.
  const markdown = await createMarkdownRenderer(root, { languages: [] });
  function checkTokens(file, tokens) {
    for (const token of tokens) {
      const target = token.type === "link_open" ? token.attrGet("href") : token.type === "image" ? token.attrGet("src") : null;
      if (target) checkLink(file, target);
      if (token.children) checkTokens(file, token.children);
    }
  }
  const tracked = new Set(git("ls-files", "-z").toString().split("\0"));
  const files = [...new Set(git("ls-files", "-z", "--cached", "--others", "--exclude-standard").toString().split("\0"))];
  for (const file of files) {
    if (!file.endsWith(".md") || !exists(file) || !statSync(resolve(root, file)).isFile()) continue;
    // Local stand skill predates this migration and is not part of this change.
    if (file.startsWith(".agents/") && !tracked.has(file) && !file.startsWith(".agents/skills/boristype-compiler-development/")) continue;
    checkTokens(file, markdown.parse(read(file), {}));
  }
  for (const item of exceptions) {
    if (!seenExceptions.has(`${item.file}\n${item.target}`)) errors.push(`Stale link exception: ${item.file} → ${item.target}`);
  }

  const config = "docs/.vitepress/config.mts";
  if (exists(config)) {
    for (const match of read(config).matchAll(/\blink:\s*["']([^"']*)["']/g)) checkLink(config, match[1]);
  }

  const manifest = JSON.parse(read("refs/migration-map.json"));
  const sources = new Set();
  for (const entry of manifest.entries) {
    if (sources.has(entry.source)) errors.push(`Duplicate migration source: ${entry.source}`);
    sources.add(entry.source);
    if (!exists(entry.destination)) errors.push(`Missing migration destination: ${entry.destination}`);
    const original = git("show", `${manifest.baseCommit}:${entry.source}`);
    if (hash(original) !== entry.sourceSha256) errors.push(`Wrong original hash: ${entry.source}`);
    if (entry.preserveBytes && exists(entry.destination)) {
      preserved++;
      if (hash(readFileSync(resolve(root, entry.destination))) !== entry.sourceSha256)
        errors.push(`Changed evidence bytes: ${entry.destination}`);
    }
    if (entry.action !== "snapshot-before-rewrite" && exists(entry.source)) errors.push(`Retired source still exists: ${entry.source}`);
  }
  const originals = git("ls-tree", "-r", "--name-only", manifest.baseCommit, "ref", "plans").toString().trim().split("\n").filter(Boolean);
  for (const source of originals) if (!sources.has(source)) errors.push(`Missing migration accounting: ${source}`);
  for (const oldDirectory of ["ref", "plans"]) {
    if (exists(oldDirectory)) errors.push(`Retired directory still exists: ${oldDirectory}`);
  }
  console.log(
    `Checked ${links} local targets, ${manifest.entries.length} migration entries, ${preserved} byte-preserved artifacts; ${exceptions.length} documented historical link gaps.`,
  );
} catch (error) {
  errors.push(`Documentation check could not complete: ${error.message}`);
}

for (const error of errors) console.error(error);
if (errors.length) process.exitCode = 1;
