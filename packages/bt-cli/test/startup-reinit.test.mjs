import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { reinitModules } from "../build/core/pushing/reinit.js";
import { WshcmRequestError } from "@boristype/ws-client";

function dist(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "btc-reinit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "wt/bt-startup-objects"), { recursive: true });
  fs.mkdirSync(path.join(root, "source"));
  fs.writeFileSync(
    path.join(root, "source/api_ext.xml"),
    "<api_ext><apis><api><name>module:bt-startup-objects</name><libs><lib><path>x-local://wt/bt-startup-objects/init.xml</path></lib></libs></api></apis></api_ext>",
  );
  fs.writeFileSync(
    path.join(root, "wt/bt-startup-objects/init.xml"),
    '<SPXML-INLINE-FORM><OnInit PROPERTY="1" EXPR="applyObjects()"/></SPXML-INLINE-FORM>',
  );
  return root;
}

test("object-only push invokes the loader without the application runtime", async (t) => {
  const seen = [];
  await reinitModules(
    {
      eval: async (code) => {
        seen.push(code);
        return "ok";
      },
    },
    dist(t),
  );
  assert.equal(seen.length, 1);
  assert.match(seen[0], /applyObjects/);
});

test("push propagates startup or subsequent reset failure without reconnect/replay", async (t) => {
  const root = dist(t);
  fs.mkdirSync(path.join(root, "components/app"), { recursive: true });
  for (const failAt of [1, 2]) {
    const seen = [];
    const invoke = async (code) => {
      seen.push(code);
      if (seen.length === failAt) throw new WshcmRequestError("network", "request failed");
      return "ok";
    };
    await assert.rejects(
      reinitModules({ eval: invoke, evalCode: invoke }, root),
      (err) => !(err instanceof WshcmRequestError) && /request failed/.test(err.message),
    );
    assert.equal(seen.length, failAt);
    assert.match(seen[0], /applyObjects/);
  }
});

test("a native diagnostic reaches CI and an incomplete startup entry fails locally", async (t) => {
  const root = dist(t);
  await assert.rejects(
    reinitModules({ eval: async () => "error: ID 42 (validate, not_attempted): unknown field" }, root),
    /ID 42.*unknown field/,
  );
  fs.unlinkSync(path.join(root, "wt/bt-startup-objects/init.xml"));
  await assert.rejects(reinitModules({}, root), /startup.*init.xml/i);
});
