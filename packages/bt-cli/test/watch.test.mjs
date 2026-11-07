import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The child must exit naturally after close; the parent also bounds leaked watchers.
test("non-TS watcher copies changes, respects exclusions and releases filesystem handles", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("fixtures/watch-probe.mjs", import.meta.url))], {
    encoding: "utf8",
    timeout: 20_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr + result.stdout);
});
