import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { buildScript } from "../build/load.js";

// These tests check local substitution and JavaScript syntax, not native BS execution.
for (const value of [
  "x-local://wt/a$&b.bs",
  "x-local://wt/$`/$'/$$.bs",
  "x-local://wt/quote'and\\slash.bs",
  'x-local://wt/double"quote.bs',
  "line1\r\nline2\tend",
  "before\u2028middle\u2029after",
  "nul\0followed-by-1",
  "Привет 👋",
]) {
  test(`template parameter survives local round trip: ${JSON.stringify(value)}`, () => {
    const script = buildScript("return '${path}';", { path: value });
    assert.equal(runInNewContext(`(function () { ${script} })()`), value);
  });
}

test("parameter contents are not substituted again as template placeholders", () => {
  const script = buildScript("return ['${path}', '${suffix}', '${path}'];", {
    path: "${suffix}",
    suffix: "replacement",
  });
  assert.deepEqual(Array.from(runInNewContext(`(function () { ${script} })()`)), ["${suffix}", "replacement", "${suffix}"]);
});

test("missing parameters and inherited properties are not expanded", () => {
  assert.equal(buildScript("'${missing}' '${toString}'", {}), "'${missing}' '${toString}'");
});
