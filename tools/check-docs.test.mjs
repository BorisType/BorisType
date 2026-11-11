import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const checker = fileURLToPath(new URL("./check-docs.mjs", import.meta.url));

function fixture(t, additionalOriginals = {}) {
  const root = mkdtempSync(join(tmpdir(), "boristype-docs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function write(path, text) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  function git(...args) {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  }
  git("init", "-q");
  write("ref/probe.bs", "MESSAGE = 42;\n");
  write("README.md", "# Original\n");
  for (const [path, content] of Object.entries(additionalOriginals)) write(path, content);
  git("add", ".");
  git(
    "-c",
    "user.name=Docs test",
    "-c",
    "user.email=docs@example.invalid",
    "-c",
    "commit.gpgSign=false",
    "-c",
    "core.hooksPath=" + join(root, "no-hooks"),
    "commit",
    "-qm",
    "baseline",
  );
  const baseCommit = git("rev-parse", "HEAD");
  rmSync(join(root, "ref"), { recursive: true });
  write("refs/probe.bs", "MESSAGE = 42;\n");
  write(
    "refs/migration-map.json",
    JSON.stringify({
      version: 1,
      baseCommit,
      entries: [
        {
          source: "README.md",
          destination: "README.md",
          action: "rewritten",
          sourceRetained: true,
          sourceSha256: createHash("sha256").update("# Original\n").digest("hex"),
          preserveBytes: false,
        },
        {
          source: "ref/probe.bs",
          destination: "refs/probe.bs",
          action: "relocated",
          sourceSha256: createHash("sha256").update("MESSAGE = 42;\n").digest("hex"),
          preserveBytes: true,
        },
      ],
    }),
  );
  write("README.md", "[Page](docs/page.md#part)\n");
  write("docs/page.md", "# Part\n");
  return { root, write, run: () => spawnSync(process.execPath, [checker, root], { encoding: "utf8" }) };
}

test("accepts existing targets, encoded paths, reference links and fenced examples", (t) => {
  const f = fixture(t);
  f.write("docs/a b.md", "# Space\n");
  f.write("README.md", "[A](docs/page.md)\n[B](docs/a%20b.md)\n[Ref][id]\n\n[id]: docs/page.md\n\n```md\n[example](missing.md)\n```\n");
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("rejects a missing local link including a reference definition", (t) => {
  const f = fixture(t);
  f.write("README.md", "[Ref][missing]\n\n[missing]: gone.md\n");
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /gone\.md/);
});

test("rejects a nonexistent VitePress route", (t) => {
  const f = fixture(t);
  f.write("docs/.vitepress/config.mts", 'export default { nav: [{ text: "Missing", link: "/guides/gone" }] };\n');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /guides\/gone/);
});

test("detects changed evidence bytes", (t) => {
  const f = fixture(t);
  f.write("refs/probe.bs", "MESSAGE = 43;\n");
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /refs\/probe\.bs/);
});

test("detects an original material missing from the migration map", (t) => {
  const f = fixture(t);
  f.write(
    "refs/migration-map.json",
    JSON.stringify({
      version: 1,
      baseCommit: execFileSync("git", ["-C", f.root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      entries: [],
    }),
  );
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /ref\/probe\.bs/);
});

test("rejects missing targets in this repository's main GitHub links", (t) => {
  const f = fixture(t);
  f.write("README.md", "[Remote](https://github.com/BorisType/BorisType/blob/main/docs/missing.md)\n");
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /docs\/missing\.md/);
});

test("rejects a missing repository target in VitePress navigation", (t) => {
  const f = fixture(t);
  f.write(
    "docs/.vitepress/config.mts",
    'export default { nav: [{ text: "Dev", link: "https://github.com/BorisType/BorisType/tree/main/refs/missing" }] };\n',
  );
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /refs\/missing/);
});

test("rejects a VitePress directory route without an index page", (t) => {
  const f = fixture(t);
  f.write("docs/guides/existing.md", "# Existing\n");
  f.write("docs/.vitepress/config.mts", 'export default { nav: [{ text: "Guides", link: "/guides" }] };\n');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /guides/);
});

test("accepts balanced parentheses in a Markdown link destination", (t) => {
  const f = fixture(t);
  f.write("docs/a(b).md", "# Page\n");
  f.write("README.md", "[Page](docs/a(b).md)\n");
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("checks nested link labels and image destinations", (t) => {
  const f = fixture(t);
  f.write("README.md", "[Page [draft]](docs/missing.md)\n![Image](gone.png)\n");
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /docs\/missing\.md/);
  assert.match(result.stdout + result.stderr, /gone\.png/);
});

test("accepts repository directory links and VitePress routes with an index", (t) => {
  const f = fixture(t);
  f.write("docs/guides/index.md", "# Guides\n");
  f.write("README.md", "[Sources](refs/)\n");
  f.write("docs/.vitepress/config.mts", 'export default { nav: [{ text: "Guides", link: "/guides/" }] };\n');
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("resolves site asset links from the VitePress public directory", (t) => {
  const f = fixture(t);
  f.write("docs/public/logo.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  f.write("docs/page.md", "![Logo](/logo.svg)\n");
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("allows a summarized original whose source is explicitly retained and rewritten", (t) => {
  const f = fixture(t);
  const manifest = JSON.parse(readFileSync(join(f.root, "refs/migration-map.json"), "utf8"));
  Object.assign(
    manifest.entries.find((entry) => entry.source === "README.md"),
    {
      source: "README.md",
      destination: "refs/summary.md",
      action: "summarized",
      sourceRetained: true,
      sourceSha256: createHash("sha256").update("# Original\n").digest("hex"),
      preserveBytes: false,
      notes: "Unique rationale retained in summary; user entry rewritten in place.",
    },
  );
  f.write("refs/summary.md", "# Summary\n");
  f.write("refs/migration-map.json", JSON.stringify(manifest));
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("rejects deletion of a source declared retained and rewritten", (t) => {
  const f = fixture(t);
  const manifest = JSON.parse(readFileSync(join(f.root, "refs/migration-map.json"), "utf8"));
  Object.assign(
    manifest.entries.find((entry) => entry.source === "README.md"),
    {
      source: "README.md",
      destination: "refs/summary.md",
      action: "summarized",
      sourceRetained: true,
      sourceSha256: createHash("sha256").update("# Original\n").digest("hex"),
      preserveBytes: false,
    },
  );
  f.write("refs/summary.md", "# Summary\n");
  f.write("refs/migration-map.json", JSON.stringify(manifest));
  rmSync(join(f.root, "README.md"));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /README\.md/);
});

test("detects a rewritten root document omitted from migration accounting", (t) => {
  const f = fixture(t);
  const manifest = JSON.parse(readFileSync(join(f.root, "refs/migration-map.json"), "utf8"));
  manifest.entries = manifest.entries.filter((entry) => entry.source !== "README.md");
  f.write("refs/migration-map.json", JSON.stringify(manifest));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /Missing migration accounting: README\.md/);
});

for (const source of [".github/copilot-instructions.md", "packages/bt-ir/src/lowering/REFACTORING.md"]) {
  test(`detects deleted instructions omitted from accounting: ${source}`, (t) => {
    const f = fixture(t, { [source]: "# Original instructions\n" });
    rmSync(join(f.root, source));
    const result = f.run();
    assert.equal(result.status, 1);
    assert.ok((result.stdout + result.stderr).includes(`Missing migration accounting: ${source}`));
  });
}
