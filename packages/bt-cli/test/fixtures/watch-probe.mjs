import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { watchNonTypescriptFiles } from "../../build/core/building/files.js";
import { logger } from "../../build/core/logger.js";

/** Wait for an observable filesystem result, with a deadline independent of the parent watchdog. */
async function until(condition, description) {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${description}`);
    await delay(10);
  }
}

const root = mkdtempSync(join(tmpdir(), "boristype-watch-"));
const source = join(root, "src");
const output = join(source, "generated");
mkdirSync(source);
writeFileSync(join(source, "initial.txt"), "initial");
const changes = [];
const errors = [];
let ready = false;
// Observe the real ready event through its logging boundary; never mock the watcher or IO.
logger.info = (message) => {
  if (message.includes("Non-TS watcher ready")) ready = true;
};
logger.error = (message) => errors.push(message);
const watcher = watchNonTypescriptFiles(
  {
    cwd: root,
    options: {},
    tsConfig: { options: { rootDir: source, outDir: output }, raw: { exclude: ["src/excluded"] } },
  },
  (file) => changes.push(file),
);
try {
  await until(() => ready, "watcher ready");
  assert.equal(existsSync(join(output, "initial.txt")), false, "ignoreInitial must preserve initial-copy ownership");

  for (const directory of ["excluded", "node_modules", "generated"]) mkdirSync(join(source, directory));
  writeFileSync(join(source, "excluded", "hidden.txt"), "excluded");
  writeFileSync(join(source, "node_modules", "hidden.txt"), "dependency");
  writeFileSync(join(output, "own-output.txt"), "generated");
  writeFileSync(join(source, "ignored.ts"), "export const value = 1");
  writeFileSync(join(source, "ignored.tsx"), "export default 1");

  const file = join(source, "asset.txt");
  const copied = join(output, "asset.txt");
  writeFileSync(file, "first");
  await until(() => existsSync(copied) && readFileSync(copied, "utf8") === "first", "added asset copy");
  writeFileSync(file, "changed content");
  await until(() => readFileSync(copied, "utf8") === "changed content", "changed asset copy");
  rmSync(file);
  await until(() => !existsSync(copied), "unlinked asset removal");

  mkdirSync(join(source, "nested"));
  writeFileSync(join(source, "nested", "child.txt"), "nested");
  await until(() => existsSync(join(output, "nested", "child.txt")), "new nested directory asset");
  rmSync(join(source, "nested"), { recursive: true });
  await until(() => !existsSync(join(output, "nested", "child.txt")), "removed directory descendant cleanup");

  assert.equal(existsSync(join(output, "excluded")), false);
  assert.equal(existsSync(join(output, "node_modules")), false);
  assert.equal(existsSync(join(output, "generated")), false, "output must not feed back into the watcher");
  assert.equal(existsSync(join(output, "ignored.ts")), false);
  assert.equal(existsSync(join(output, "ignored.tsx")), false);
  assert.ok(changes.includes(copied), "copy callbacks are observable");
  assert.ok(changes.includes(file), "delete callbacks identify the source");
  assert.deepEqual(errors, []);
} finally {
  watcher.close();
  rmSync(root, { recursive: true, force: true });
}
