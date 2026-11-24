import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { processPackagesLinking } from "../build/core/linking/index.js";
import { collectStandaloneInitScripts, resolveXLocalPath } from "../build/core/pushing/init-scripts.js";

const cli = fileURLToPath(new URL("../build/index.js", import.meta.url));
const moduleName = "module:bt-startup-objects";

function put(root, name, content) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "btc-objects-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  put(root, "package.json", '{"name":"example"}');
  return root;
}

function link(root, ...args) {
  const result = spawnSync(process.execPath, [cli, "link", "--external-runtime", ...args], { cwd: root, encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr + result.stdout);
}

function startup(root) {
  const dist = path.join(root, "dist");
  const scripts = collectStandaloneInitScripts(dist).filter((script) => script.name === moduleName);
  assert.equal(scripts.length, 1, "one startup entry registered for the entire release");
  const calls = [];
  runInNewContext(scripts[0].code, { LdsIsServer: false });
  runInNewContext(scripts[0].code, {
    LdsIsServer: true,
    OpenCodeLib(url) {
      assert.ok(fs.statSync(resolveXLocalPath(dist, url)).size > 0);
      return {
        BtLoadStartupObjects(urls) {
          for (const rootUrl of urls) {
            assert.match(rootUrl, /^x-local:\/\/wt\//);
            calls.push(resolveXLocalPath(dist, rootUrl));
          }
        },
      };
    },
  });
  return calls;
}

test("objects-only project links without a build and retires removed files across upload overlays", (t) => {
  const root = project(t);
  const object = "objects/cost_center/9007199254740993.xml";
  const bytes = Buffer.from("\uFEFF<cost_center><name>Центр</name></cost_center>\r\n");
  put(root, object, bytes);
  put(root, "objects/cost_center/11.xml", "<cost_center/>");
  link(root);
  const [first] = startup(root);
  assert.deepEqual(fs.readFileSync(path.join(first, "cost_center/9007199254740993.xml")), bytes);

  fs.unlinkSync(path.join(root, "objects/cost_center/11.xml"));
  link(root);
  const [next] = startup(root);
  assert.notEqual(first, next, "an overlay upload may leave files at the old remote URL");
  assert.deepEqual(fs.readdirSync(path.join(next, "cost_center")), ["9007199254740993.xml"]);
  assert.equal(fs.existsSync(first), false, "old releases should not enter the next archive");

  fs.rmSync(path.join(root, "objects"), { recursive: true });
  link(root, "--clean");
  assert.deepEqual(collectStandaloneInitScripts(path.join(root, "dist")), []);
  assert.ok(fs.existsSync(path.join(root, "dist/source/api_ext.xml")), "overwrite the former registration on an overlay deploy");
  link(root, "--clean");
  assert.ok(fs.existsSync(path.join(root, "dist/source/api_ext.xml")));
});

test("standalone, component and project objects share startup and retain custom application init during an incremental link", async (t) => {
  const root = project(t);
  const packages = [{ name: "app" }, { name: "comp" }];
  put(root, "btconfig.json", JSON.stringify({ linking: { packages } }));
  for (const [pkg, kind] of [
    ["app", "standalone"],
    ["comp", "component"],
  ]) {
    put(root, pkg + "/package.json", JSON.stringify({ name: pkg, version: "1.0.0", "ws:name": pkg, "ws:package": kind, main: "index.js" }));
    put(root, pkg + "/build/index.js", "function init() {}");
  }
  const custom = '<SPXML-INLINE-FORM><OnInit PROPERTY="1" EXPR="MyCustomInit()"/></SPXML-INLINE-FORM>';
  put(root, "app/build/init.xml", custom);
  for (const [dir, id] of [
    [".", "1"],
    ["app", "2"],
    ["comp", "3"],
  ]) {
    put(root, dir + "/objects/cost_center/" + id + ".xml", "<cost_center/>");
  }
  link(root);
  const assertLinked = () => {
    const allIds = startup(root).flatMap((base) => fs.readdirSync(path.join(base, "cost_center")));
    assert.deepEqual(allIds.sort(), ["1.xml", "2.xml", "3.xml"]);
    assert.equal(fs.readFileSync(path.join(root, "dist/wt/app/init.xml"), "utf8"), custom);
    assert.ok(collectStandaloneInitScripts(path.join(root, "dist")).some((s) => s.code === "MyCustomInit()"));
  };
  assertLinked();
  await processPackagesLinking(root, [packages[1]], {
    externalRuntime: true,
    devMode: true,
    changedFiles: [path.join(root, "comp/build/index.js")],
  });
  assertLinked();

  put(root, "comp/objects/training/2.xml", "<training/>");
  await assert.rejects(processPackagesLinking(root, packages, { externalRuntime: true }), /duplicate.*2/i);
  assertLinked();
});

test("a user-owned destination and API name survive a startup output collision", async (t) => {
  const root = project(t);
  const custom = "application file";
  put(root, "objects/cost_center/5.xml", "<cost_center/>");
  put(root, "dist/wt/bt-startup-objects/init.xml", custom);
  await assert.rejects(processPackagesLinking(root, [], { externalRuntime: true }), /collision|already exists|reserved/i);
  assert.equal(fs.readFileSync(path.join(root, "dist/wt/bt-startup-objects/init.xml"), "utf8"), custom);

  fs.rmSync(path.join(root, "dist/wt/bt-startup-objects"), { recursive: true });
  put(
    root,
    "app/package.json",
    JSON.stringify({ name: "app", "ws:name": "app", "ws:package": "standalone", "ws:apiext": { name: moduleName, libs: ["custom.xml"] } }),
  );
  put(root, "app/build/custom.xml", custom);
  await assert.rejects(processPackagesLinking(root, [{ name: "app" }], { externalRuntime: true }), /collision|already exists|reserved/i);
});

test("startup augments a supplied API registry and preserves its custom library", async (t) => {
  const root = project(t);
  put(root, "btconfig.json", JSON.stringify({ linking: { packages: [{ name: "static", source: "static", target: "." }] } }));
  put(
    root,
    "static/source/api_ext.xml",
    "<api_ext><apis><api><name>module:user</name><libs><lib><path>x-local://wt/user/init.xml</path></lib></libs></api></apis></api_ext>",
  );
  put(root, "static/wt/user/init.xml", '<SPXML-INLINE-FORM><OnInit PROPERTY="1" EXPR="Custom()"/></SPXML-INLINE-FORM>');
  put(root, "objects/cost_center/12.xml", "<cost_center/>");
  link(root);
  assert.deepEqual(
    collectStandaloneInitScripts(path.join(root, "dist")).map((s) => s.name),
    [moduleName, "module:user"],
  );
  link(root);
  assert.equal(startup(root).length, 1);
  put(root, "objects/other/12.xml", "<other/>");
  await assert.rejects(
    processPackagesLinking(root, [{ name: "static", source: "static", target: "." }], { externalRuntime: true }),
    /duplicate.*12/i,
  );
  assert.equal(startup(root).length, 1);
  fs.rmSync(path.join(root, "objects"), { recursive: true });
  link(root);
  assert.deepEqual(
    collectStandaloneInitScripts(path.join(root, "dist")).map((s) => s.code),
    ["Custom()"],
  );
});

test("link without startup files leaves an ordinary component and its user-owned destination alone", async (t) => {
  const root = project(t);
  put(root, "package.json", JSON.stringify({ name: "empty", version: "1.0.0", "ws:name": "empty", "ws:package": "component" }));
  put(root, "build/asset.txt", "user data");
  put(root, "dist/wt/bt-startup-objects/custom.txt", "keep");
  put(root, "objects/exported-center.xml", "<cost_center/>");
  await processPackagesLinking(root, [{ name: "." }], { externalRuntime: true });
  assert.deepEqual(fs.readdirSync(path.join(root, "dist/wt/bt-startup-objects")), ["custom.txt"]);
  assert.equal(fs.existsSync(path.join(root, "dist/source/api_ext.xml")), false);
  assert.equal(fs.readFileSync(path.join(root, "dist/components/empty/asset.txt"), "utf8"), "user data");
});

test("an explicitly listed current package can contain just objects", (t) => {
  const root = project(t);
  put(root, "btconfig.json", JSON.stringify({ linking: { packages: [{ name: "." }] } }));
  put(root, "objects/cost_center/12.xml", "<cost_center/>");
  link(root);
  assert.equal(startup(root).length, 1);
});

test("a fresh checkout can retire the server's prior object release by keeping an empty objects directory", (t) => {
  const root = project(t);
  put(root, "objects/.gitkeep", "");
  link(root);
  const dist = path.join(root, "dist");
  assert.ok(fs.existsSync(path.join(dist, "source/api_ext.xml")));
  assert.deepEqual(collectStandaloneInitScripts(dist), []);
  assert.equal(fs.existsSync(path.join(dist, "wt/bt-startup-objects")), false);
});

test("failed relink preserves the active startup when a new package targets its init.xml", async (t) => {
  const root = project(t);
  put(root, "objects/cost_center/1.xml", "<cost_center/>");
  link(root);
  const original = startup(root);
  put(root, "static/custom.xml", "<custom/>");
  const collision = { name: "static", source: "static/custom.xml", target: "wt/bt-startup-objects/init.xml" };
  await assert.rejects(processPackagesLinking(root, [collision], { externalRuntime: true }), /collision/i);
  assert.deepEqual(startup(root), original);
});

test("a supplied empty API root can receive the startup entry", (t) => {
  const root = project(t);
  put(root, "btconfig.json", JSON.stringify({ linking: { source: "static", target: "source" } }));
  put(root, "static/api_ext.xml", "<api_ext/>");
  put(root, "objects/cost_center/1.xml", "<cost_center/>");
  link(root);
  assert.equal(startup(root).length, 1);
});
