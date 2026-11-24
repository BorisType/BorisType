// Deliver ONLY a fixed research fixture into the unique scratch directory of the disposable Linux stand.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { WshcmClient } from "../../../ws-client/build/index.js";

const [directory, filename, value, identityContainer] = process.argv.slice(2);
assert.match(directory, /^\/tmp\/bt-kestrel-[A-Za-z0-9_]+$/);
let content;
if (["A.dll", "B.dll", "C.dll"].includes(filename)) {
  content = value === "broken" ? Buffer.from("incomplete probe") : await readFile(join(directory, basename(filename)));
} else {
  assert.ok((filename === "v1.active" && ["A", "B"].includes(value)) || (filename === "v2.active" && value === "C"));
  content = Buffer.from(value);
}
assert.ok(content.length > 0 && content.length < 65536);
const { WSHCM_USERNAME: username, WSHCM_PASSWORD: password } = process.env;
assert.ok(username && password);
const client = new WshcmClient({ host: "127.0.0.1", port: Number(process.env.WSHCM_PORT ?? 80), overHttps: false, username, password });
await client.initialize();
const evaluator = client.createEvaluator();
try {
  await evaluator.initialize();
  const tmp = directory + "/" + randomUUID() + ".part";
  const path = directory + "/" + filename;
  const bytes = await evaluator.eval(`
    PutFileData('${tmp}',Base64Decode('${content.toString("base64")}'));
    var core = tools.dotnet_host.Object.GetAssembly('mscorlib');
    core.CallClassStaticMethod('System.IO.File','Move',['${tmp}','${path}',true]);
    return FileSize('${path}');`);
  assert.equal(bytes, BigInt(content.length));
  if (identityContainer) {
    // Probe the actual post-SOAP cookie jar. Pass it to the loopback verifier over a private pipe.
    // The TypeScript-private SDK member is only accessed by this version-specific test fixture.
    assert.ok(client.cookies instanceof Map && client.cookies.size > 0);
    const report = execFileSync("python3", [fileURLToPath(new URL("./verify.py", import.meta.url)), identityContainer], {
      input: [...client.cookies.values()].join("; "),
      stdio: ["pipe", "pipe", "inherit"],
      timeout: 30000,
    });
    process.stdout.write(report);
  }
} finally {
  assert.equal(await evaluator.close(), true, "probe evaluator cleanup not confirmed");
}
