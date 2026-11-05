import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const pnpm = process.env.npm_execpath;
assert.ok(pnpm, "Run this check via pnpm test:pack");
// pnpm may be either a Node script (CI) or a standalone native executable.
const nodeScript = /\.[cm]?js$/i.test(pnpm);

// Keep the extracted package below packageRoot to reuse workspace dependencies.
// This checks the actual tarball contents/imports, not a fresh registry install.
const temporary = mkdtempSync(join(packageRoot, ".pack-smoke-"));
try {
  const tarball = join(temporary, "mcp-server.tgz");
  execFileSync(nodeScript ? process.execPath : pnpm, [...(nodeScript ? [pnpm] : []), "pack", "--out", tarball], {
    cwd: packageRoot,
    timeout: 30_000,
    stdio: "pipe",
  });
  execFileSync("tar", ["-xzf", tarball, "-C", temporary], { timeout: 10_000 });
  const extracted = join(temporary, "package");
  for (const filename of readdirSync(join(packageRoot, "resources"))) {
    assert.equal(
      readFileSync(join(extracted, "resources", filename), "utf8"),
      readFileSync(join(packageRoot, "resources", filename), "utf8"),
    );
  }
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'const m = await import("./build/index.js"); if (typeof m.createServer !== "function" || typeof m.startServer !== "function") throw new Error("Missing exports");',
    ],
    { cwd: extracted, timeout: 10_000, stdio: "pipe" },
  );
  const help = execFileSync(process.execPath, [join(extracted, "build/cli.js"), "--help"], { encoding: "utf8", timeout: 10_000 });
  assert.match(help, /Usage: boristype-mcp/);
  const { version } = JSON.parse(readFileSync(join(extracted, "package.json"), "utf8"));
  const cliVersion = execFileSync(process.execPath, [join(extracted, "build/cli.js"), "--version"], { encoding: "utf8", timeout: 10_000 });
  assert.equal(cliVersion.trim(), version);
  console.log("PASS: tarball resources, package import, CLI help/version (workspace dependencies; no HCM connection)");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
