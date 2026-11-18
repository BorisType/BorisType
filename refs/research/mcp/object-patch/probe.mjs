import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { sha256, withStand } from "./stand.mjs";
const name = process.argv[2];
assert.ok(["observe", "file-observe", "form-probe", "date-probe"].includes(name));
const template = await readFile(new URL(name + ".bs", import.meta.url), "utf8");
if (process.argv[3] === "--verify") {
  const historical = JSON.parse(await readFile(new URL(name + "-result.json", import.meta.url)));
  assert.equal(sha256(template.replaceAll("${marker}", historical.probe.marker)), historical.probe.sourceSha256);
} else {
  const receipt = await withStand(async (ev, r) => {
    const source = template.replaceAll("${marker}", r.marker);
    const prefix = name === "file-observe" ? "boristype_patch_observe_" : name === "date-probe" ? "bt_date_probe_" : undefined;
    const path = prefix ? "UrlToFilePath('x-local://wt/" + prefix + r.marker + ".xml')" : undefined;
    if (path) assert.equal(JSON.parse(await ev.eval("return EncodeJson(FilePathExists(" + path + "));")), false);
    try {
      r.report = JSON.parse(await ev.eval(source));
    } finally {
      if (path) {
        assert.equal(
          JSON.parse(await ev.eval("var p=" + path + ";if(FilePathExists(p)) DeleteFile(p);return EncodeJson(!FilePathExists(p));")),
          true,
        );
        r.cleanup.temporaryFileAbsent = true;
      }
    }
    r.probe = { marker: r.marker, sourceSha256: sha256(source) };
  });
  const output = JSON.stringify(receipt, null, 2) + "\n";
  if (process.env.WSHCM_PATCH_RECEIPT) await writeFile(process.env.WSHCM_PATCH_RECEIPT, output);
  console.log(output);
}
