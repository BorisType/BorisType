// Local driver for the two fixed builds created by verify-upgrade.py.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { WshcmClient, WshcmRuntime } from "../../../../ws-client/build/index.js";

const [bundleDirectory, action] = process.argv.slice(2);
assert.ok(["install", "stage"].includes(action));
const { WSHCM_USERNAME: username, WSHCM_PASSWORD: password, WSHCM_HOST: host } = process.env;
assert.ok(host && username && password);
const client = new WshcmClient({ host, port: 80, overHttps: false, username, password });
await client.initialize();
const evaluator = client.createEvaluator();
try {
  await evaluator.initialize();
  const runtime = new WshcmRuntime(evaluator, { bundleDirectory, installationName: ".bt-http-wrapper-probe" });
  const result = await runtime.stageForStartup();
  assert.equal(result.status, "installed", result.reason);
  assert.equal(result.installed.id, "BorisType.ComponentMappingProbe");
  if (action === "install") {
    // Prepare all three known files outside components/. Directory.Move only publishes into a free name.
    const files = [];
    for (const name of ["package.json", "spxml/component.xml", "spxml/component.js"]) {
      const bytes = await readFile(new URL("./package/" + name, import.meta.url));
      files.push({ name, data: bytes.toString("base64") });
    }
    const published = await evaluator.eval(`
      var source = FilePath(AppDirectoryPath(), '.bt-wrapper-probe-${randomUUID()}');
      var destination = FilePath(FilePath(AppDirectoryPath(), 'components'), 'bt_http_mapping_probe');
      var core = tools.dotnet_host.Object.GetAssembly('mscorlib');
      ObtainDirectory(FilePath(source, 'spxml'), true);
      try {
        var files = ParseJson('${JSON.stringify(files)}');
        var target; var data;
        for (var i = 0; i < ArrayCount(files); i++) {
          target = FilePath(source, files[i].name);
          data = files[i].data;
          PutFileData(target, Base64Decode(data));
          if (Base64Encode(LoadFileData(target)) != data) throw 'Component file readback mismatch';
        }
        core.CallClassStaticMethod('System.IO.Directory', 'Move', [source, destination]);
      } catch (publishError) {
        throw publishError;
      } finally {
        if (core.CallClassStaticMethod('System.IO.Directory', 'Exists', [source]))
          core.CallClassStaticMethod('System.IO.Directory', 'Delete', [source, true]);
      }
      return true;`);
    assert.equal(published, true);
  }
  const immediate = await runtime.ensure();
  assert.equal(immediate.status, "blocked");
  assert.equal(immediate.reason, "StartupOwnedComponent");
  console.log(JSON.stringify(result));
} finally {
  assert.equal(await evaluator.close(), true, "probe evaluator cleanup not confirmed");
}
