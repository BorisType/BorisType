// Opt-in Linux C-runtime acceptance. Temporary file exercises independent reopen
// and save hooks on a custom form. The database lifecycle uses the unmodified SDK.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { WshcmApi } from "../../build/index.js";
import { inspectObjectPatchXml, inspectObjectXml } from "../../build/hcm/object-xml.js";
import { buildScript } from "../../build/hcm/load.js";
import { sha256, withStand } from "../../../../refs/research/mcp/object-patch/stand.mjs";
const helper = await readFile(new URL("../../resources/object-patch.bs", import.meta.url), "utf8");
const schema =
  '<SPXML-FORM><probe><id TYPE="integer"/><name TYPE="string"/><keep TYPE="string"/><n TYPE="integer"/><default_s TYPE="string" DEFAULT="initial"/><r TYPE="real"/><flag TYPE="bool"/><stamp TYPE="date"/><row MULTIPLE="1" PRIMARY-KEY="key"><key TYPE="string"/><v TYPE="string"/><secret TYPE="string"/><d TYPE="integer" DEFAULT="7"/></row><tag TYPE="string" MULTIPLE="1"/><nested><stamp TYPE="date"/><d TYPE="integer" DEFAULT="7"/><part MULTIPLE="1"><v TYPE="string"/><label TYPE="string" MULTIPLE="1"/></part></nested><keyed MULTIPLE="1" PRIMARY-KEY="n"><n TYPE="integer"/><v TYPE="string"/></keyed><default_key MULTIPLE="1" PRIMARY-KEY="k"><k TYPE="string" DEFAULT="default"/></default_key><bad_key MULTIPLE="1" PRIMARY-KEY="compound"><compound><v TYPE="string"/></compound></bad_key><constructor TYPE="string"/><entry MULTIPLE="1" PRIMARY-KEY="key"><key TYPE="date"/><v TYPE="string"/></entry><hook_count TYPE="integer" DEFAULT="0"/></probe><OnBeforeSave PROPERTY="1" EXPR="TopElem.hook_count = TopElem.hook_count + 1;"/></SPXML-FORM>';
async function generic(ev, receipt) {
  const formUrl = "x-local://wt/bt_patch_" + receipt.marker + ".xmd";
  const fileUrl = "x-local://wt/bt_patch_" + receipt.marker + ".xml";
  const base = "var u='" + fileUrl + "';var f='" + formUrl + "';";
  const evaluate = async (code) => JSON.parse(await ev.eval(base + code));
  assert.equal(await evaluate("return EncodeJson(FilePathExists(UrlToFilePath(u)));"), false);
  receipt.generic = { formUrl, fileUrl, cases: [] };
  try {
    await evaluate(
      buildScript(
        "RegisterFormFromStr(f,'${schema}');var d=OpenNewDoc(f);d.TopElem.LoadData('<probe><keep>sentinel</keep><row><key>a</key><secret>retain</secret></row><row><key>b</key></row><tag>keep-tag</tag></probe>');d.Save(u);return EncodeJson(true);",
        { schema },
      ),
    );
    const run = async (body, { dryRun = false } = {}) => {
      const nodes = inspectObjectPatchXml("<probe>" + body + "</probe>", { formUrl, id: "1" }).nodes;
      const result = await evaluate(
        helper +
          buildScript(
            `
try {
var candidate=OpenDoc(u);var before=candidate.TopElem.Xml;var source=CreateElemByFormElem(FetchForm(f).TopElem);
var nodes=ParseJson('\${nodes}');
BtPatchLoadSource(source,nodes);
BtApplyObjectPatch(candidate.TopElem,source,nodes);
var xml=candidate.TopElem.Xml;var changed=xml!=before;
if(changed && !\${dryRun}) candidate.Save();
var read=OpenDoc(u);
return EncodeJson({changed:changed,xml:xml,persisted:read.TopElem.Xml,hooks:StrInt(read.TopElem.hook_count.Value)});
} catch(err){ return EncodeJson({error:String(err)}); }
`,
            { nodes: JSON.stringify(nodes), dryRun: String(dryRun) },
          ),
      );
      if (result.error) throw Error(body + " " + result.error);
      return result;
    };
    const cases = [
      ["Unicode/CDATA/CRLF", "<name>  Ω\r\n<![CDATA[<&]]>  </name>", /  Ω&#10;&lt;&amp;<\/name>/],
      ["defaulted scalar assigned", "<nested><d>9</d></nested>", /<d>9<\/d>/],
      ["durable scalar clear", '<nested><d bt-mode="clear"/></nested>', /<d>7<\/d>/, /<d>9<\/d>/],
      ["defaulted scalar reassigned", "<nested><d>8</d></nested>", /<d>8<\/d>/],
      ["defaulted scalar empty", "<nested><d/></nested>", /<d>7<\/d>/, /<d>8<\/d>/],
      ["defaulted string assigned", "<default_s>override</default_s>", /<default_s>override<\/default_s>/],
      ["empty defaulted string", "<default_s/>", /<default_s>initial<\/default_s>/],
      ["empty string", "<name/>", null, /<name>/],
      ["bool true", "<flag>true</flag>", /<flag>1<\/flag>/],
      ["bool false", "<flag>false</flag>", /<flag>0<\/flag>/],
      ["zero", "<n>0</n>", /<n>0<\/n>/],
      ["negative integer", "<n>-2</n>", /<n>0xFFFFFFFFFFFFFFFE<\/n>/],
      ["large decimal", "<n>9007199254740993</n>", /<n>0x0020000000000001<\/n>/],
      ["uint64 hex", "<n>0xffffffffffffffff</n>", /<n>0xFFFFFFFFFFFFFFFF<\/n>/],
      ["finite real", "<r>-1.25e2</r>", /<r>-125<\/r>/],
      ["date only", "<stamp>2024-02-29</stamp>", /2024-02-29T00:00:00\+00:00/],
      ["zero offset XML clock", "<stamp>2025-02-28T23:30:00+00:00</stamp>", /2025-02-28T23:30:00\+00:00/],
      ["nested date", "<nested><stamp>2025-12-31T23:59:59Z</stamp></nested>", /2025-12-31T23:59:59\+00:00/],
      ["date clear", '<stamp bt-mode="clear"/>', null, /<stamp>2025-02-28/],
      ["empty date", "<nested><stamp/></nested>", null, /<stamp>/],
      [
        "keyed merge/add",
        "<row><key>a</key><v>new</v></row><row><key>__proto__</key></row>",
        /<key>a<\/key>[\s\S]*<v>new<\/v>[\s\S]*<secret>retain<\/secret>[\s\S]*<key>b<\/key>[\s\S]*<key>__proto__<\/key>/,
      ],
      [
        "keyed item replace",
        '<row bt-mode="replace"><key>a</key></row>',
        /<key>a<\/key>[\s\S]*<d>7<\/d>[\s\S]*<key>b<\/key>/,
        /<secret>|<v>new/,
      ],
      ["keyed remove", '<row bt-mode="remove"><key>b</key></row>', /<key>a<\/key>/, /<key>b<\/key>/],
      [
        "root interleaved group replace",
        '<row bt-mode="replace-array"><key>z</key></row><tag>first</tag><row><key>x</key></row><tag>second</tag>',
        /^(?=[\s\S]*<key>z<\/key>[\s\S]*<key>x<\/key>)(?=[\s\S]*<tag>first<\/tag>[\s\S]*<tag>second<\/tag>)/,
        /<key>a<\/key>/,
      ],
      [
        "replace group preserves sibling",
        '<row bt-mode="replace-array"><key>only</key></row>',
        /<key>only<\/key>[\s\S]*<tag>first<\/tag>[\s\S]*<tag>second<\/tag>/,
        /<key>x<\/key>/,
      ],
      [
        "compound unkeyed nested arrays",
        "<nested><part><v>one</v><label>A</label><label>B</label></part><part><v>two</v><label>C</label></part></nested>",
        /<v>one<\/v>[\s\S]*<label>A<\/label>[\s\S]*<label>B<\/label>[\s\S]*<v>two<\/v>[\s\S]*<label>C<\/label>/,
      ],
      [
        "container replace/default",
        '<nested bt-mode="replace"><stamp>2026-01-01</stamp></nested>',
        /<stamp>2026-01-01T00:00:00\+00:00<\/stamp>[\s\S]*<d>7<\/d>/,
        /<part>/,
      ],
      ["compound clear", '<nested bt-mode="clear"/>', /<d>7<\/d>/, /<stamp>/],
      ["empty item", "<tag/>", /<tag\/>/, /<tag>first/],
      ["array clear", '<tag bt-mode="clear"/>', null, /<tag/],
      ["hazardous field name", "<constructor>literal</constructor>", /<constructor>literal<\/constructor>/],
      [
        "exact integer keys",
        "<keyed><n>9007199254740993</n><v>one</v></keyed><keyed><n>9007199254740992</n><v>two</v></keyed>",
        /<v>one<\/v>[\s\S]*<v>two<\/v>/,
      ],
      ["canonical date key", "<entry><key>2025-02-28T23:30:00+00:00</key><v>first</v></entry>", /<key>2025-02-28T23:30:00\+00:00<\/key>/],
      ["upsert equal date key", "<entry><key>2025-02-28T23:30:00Z</key><v>second</v></entry>", /<v>second<\/v>/, /<v>first<\/v>/],
    ];
    for (const [name, body, present, absent] of cases) {
      const before = await evaluate("return EncodeJson(StrInt(OpenDoc(u).TopElem.hook_count.Value));");
      const a = await run(body);
      assert.equal(a.changed, true, name);
      if (present) assert.match(a.persisted, present, name);
      if (absent) assert.doesNotMatch(a.persisted, absent, name);
      assert.match(a.persisted, /<keep>sentinel<\/keep>/);
      assert.equal(Number(a.hooks), Number(before) + 1, name);
      const b = await run(body);
      assert.equal(b.changed, false, name);
      assert.equal(b.persisted, a.persisted, name);
      assert.equal(b.hooks, a.hooks, name);
      receipt.generic.cases.push({
        name,
        changed: a.changed,
        repeatChanged: b.changed,
        hookCount: a.hooks,
        persistedSha256: sha256(a.persisted),
      });
    }
    const prev = await evaluate("return EncodeJson(OpenDoc(u).TopElem.Xml);");
    const invalidInputs = [
      "<stamp>2025-03-01T00:30:00+01:00</stamp>",
      "<stamp>2025-03-01T00:30:00-04:30</stamp>",
      "<default_key/>",
      "<bad_key><compound><v>x</v></compound></bad_key>",
      "<stamp>2025-02-29</stamp>",
      "<stamp>x</stamp>",
      "<stamp>2025-01-01T00:00:00.1Z</stamp>",
      "<flag>TRUE</flag>",
      "<r>1e309</r>",
      "<n>18446744073709551616</n>",
      "<row/>",
      '<row bt-mode="remove"><key>a</key><v/></row>',
      '<tag bt-mode="merge"/>',
      '<row bt-mode="replace-array"><key>x</key></row><row bt-mode="remove"><key>b</key></row>',
      "<keyed><n>0x10</n></keyed><keyed><n>16</n></keyed>",
      "<entry><key>2025-02-28T23:30:00+00:00</key></entry><entry><key>2025-02-28T23:30:00Z</key></entry>",
    ];
    for (const body of invalidInputs) {
      await assert.rejects(
        run(body),
        /Invalid|Unsupported|Array primary key|Remove accepts|Unkeyed|Mixed array|Duplicate input|Non-finite/,
        body,
      );
    }
    for (const body of ["<nested/>", '<row bt-mode="remove"><key>absent</key></row>']) assert.equal((await run(body)).changed, false);
    assert.equal(await evaluate("return EncodeJson(OpenDoc(u).TopElem.Xml);"), prev);
    await evaluate(
      "var d=OpenDoc(u);var row=CreateElemByFormElem(d.TopElem.FormElem.Child('row'));d.TopElem.AddChildElem(row);row.Child('key').Value='only';d.Save();return EncodeJson(true);",
    );
    const duplicateBefore = await evaluate("return EncodeJson(OpenDoc(u).TopElem.Xml);");
    await assert.rejects(run("<row><key>only</key></row>"), /Ambiguous target array primary key/);
    assert.equal(await evaluate("return EncodeJson(OpenDoc(u).TopElem.Xml);"), duplicateBefore);
    receipt.generic.ambiguousTargetRejected = true;
    const preview = await run("<name>preview</name>", { dryRun: true });
    assert.equal(preview.changed, true);
    assert.match(preview.xml, /preview/);
    assert.equal(preview.persisted, duplicateBefore);
    receipt.generic.invalidCount = invalidInputs.length;
    receipt.generic.previewAndInvalidPreserved = true;
  } finally {
    assert.equal(await evaluate("var p=UrlToFilePath(u);if(FilePathExists(p)) DeleteFile(p);return EncodeJson(!FilePathExists(p));"), true);
    receipt.cleanup.temporaryFileAbsent = true;
  }
}
async function database(ev, receipt) {
  const api = new WshcmApi(ev);
  const formUrl = "x-local://wtv/wtv_cost_center.xmd";
  const code = "bt-patch-" + receipt.marker;
  const query = "for $i in cost_centers where $i/code = '" + code + "' return $i";
  const owned = async () =>
    JSON.parse(
      await ev.eval(buildScript("var ids=[];var c;for(c in XQuery('${query}')) ids.push(StrInt(c.id));return EncodeJson(ids);", { query })),
    );
  const packageXml = () => ev.eval("return OpenDoc('x-local://'+DefaultDb+'/lists/wtv_package_objects.xml').TopElem.Xml;");
  const baseline = await packageXml();
  assert.deepEqual(await owned(), []);
  let id;
  let finalReadToken;
  try {
    const created = await api.objects.save({
      mode: "create",
      formUrl,
      xml:
        "<cost_center><code>" +
        code +
        "</code><name>initial</name><custom_elems><custom_elem><name>alpha</name><value>retained</value></custom_elem></custom_elems></cost_center>",
    });
    id = created.id;
    receipt.database = { id, formUrl, code };
    const get = () => api.objects.get({ id });
    const patch = (token, body, dryRun = false) =>
      api.objects.patch({ id, readToken: token, xml: "<cost_center>" + body + "</cost_center>", dryRun });
    // Direct native assignment distinguishes persistence from input XML parsing.
    const spelling = await ev.eval(
      buildScript(
        "var d=OpenDoc(UrlFromDocID(Int('\${id}')));if(String(d.TopElem.code)!='\${code}')throw 'fixture mismatch';d.TopElem.name.Value='  direct  ';d.TopElem.comment.Value='  comment  ';d.Save();var rd=OpenDoc(d.Url);return EncodeJson({name:rd.TopElem.name.Value,comment:rd.TopElem.comment.Value});",
        { id, code },
      ),
    );
    assert.deepEqual(JSON.parse(spelling), { name: "  direct", comment: "  comment" });
    const strings = [];
    for (const text of ["  xml  ", "<![CDATA[  xml  ]]>", "  xml&#32;&#32;"]) {
      const raw = await ev.eval(
        buildScript("var d=OpenNewDoc('\${formUrl}');d.TopElem.LoadData('\${xml}');return EncodeJson(d.TopElem.name.Value);", {
          formUrl,
          xml: "<cost_center><name>" + text + "</name></cost_center>",
        }),
      );
      const current = await get();
      const result = await patch(current.readToken, "<name>" + text + "</name><comment>" + text + "</comment>");
      const after = await get();
      assert.equal(after.xml, result.xml);
      assert.match(after.xml, /<name>  xml<\/name>/);
      assert.match(after.xml, /<comment>  xml<\/comment>/);
      strings.push({ text, nativeInput: JSON.parse(raw), changed: result.changed, readback: "  xml" });
    }
    assert.deepEqual(
      strings.map((s) => s.changed),
      [true, false, false],
    );
    assert.deepEqual(
      strings.map((s) => s.nativeInput),
      ["  xml", "  xml  ", "  xml  "],
    );
    receipt.database.stringPersistence = { direct: JSON.parse(spelling), spellings: strings };
    const dateRead = await get();
    const clock = inspectObjectXml(dateRead.xml, { formUrl, id }).nodes.find((n) => n.path.join("/") === "doc_info/modification/date");
    assert.ok(clock?.text, "fixture has persisted modification date");
    const copied = await patch(dateRead.readToken, "<doc_info><modification><date>" + clock.text + "</date></modification></doc_info>");
    assert.equal(copied.changed, false);
    assert.equal(copied.writeStatus, "not_attempted");
    assert.equal(copied.xml, dateRead.xml);
    receipt.database.copiedDate = { xmlClock: clock.text, changed: copied.changed, writeStatus: copied.writeStatus };
    const before = await get();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const preview = await patch(before.readToken, "<name>preview</name>", true);
    assert.match(preview.xml, />preview</);
    assert.equal(preview.writeStatus, "not_attempted");
    await assert.rejects(patch(before.readToken, ""), /ReadRequired/);
    const afterPreview = await get();
    assert.equal(afterPreview.xml, before.xml);
    const update = "<name>changed</name><custom_elems><custom_elem><name>beta</name><value>added</value></custom_elem></custom_elems>";
    const saved = await patch(afterPreview.readToken, update);
    assert.equal(saved.writeStatus, "saved");
    assert.equal(saved.changed, true);
    assert.match(saved.xml, /<value>retained<\/value>/);
    assert.match(saved.xml, /<value>added<\/value>/);
    assert.ok(saved.xml.includes(code));
    const current = await get();
    assert.equal(current.xml, saved.xml);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const repeated = await patch(current.readToken, update);
    assert.equal(repeated.changed, false);
    assert.equal(repeated.xml, current.xml);
    await assert.rejects(patch(current.readToken, ""), /ReadRequired/);
    const invalid = await get();
    await assert.rejects(patch(invalid.readToken, "<unknown/>"), (e) => e.details.writeStatus === "not_attempted");
    assert.equal((await get()).xml, current.xml);
    const stale = await get();
    const external = new WshcmApi(ev);
    const other = await external.objects.get({ id });
    await external.objects.patch({ id, readToken: other.readToken, xml: "<cost_center><name>other</name></cost_center>" });
    await assert.rejects(
      patch(stale.readToken, "<name>stale</name>"),
      (e) => e.details.error.code === "Conflict" && e.details.writeStatus === "not_attempted",
    );
    const final = await get();
    finalReadToken = final.readToken;
    const modClock = (xml) =>
      inspectObjectXml(xml, { formUrl, id }).nodes.find((n) => n.path.join("/") === "doc_info/modification/date").text;
    assert.notEqual(modClock(current.xml), modClock(final.xml));
    receipt.database.modificationClock = {
      saved: modClock(current.xml),
      afterNoop: modClock(repeated.xml),
      laterChangedSave: modClock(final.xml),
    };

    assert.match(final.xml, /<name>other<\/name>/);
    receipt.database.outcomes = {
      preview: preview.writeStatus,
      saved: saved.writeStatus,
      repeat: repeated.writeStatus,
      stale: "Conflict",
      previewAndNoopTokenConsumed: true,
      untouchedCustomValue: true,
      persistentReadbackSha256: sha256(final.xml),
    };
  } finally {
    // Marker lookup also covers a lost create acknowledgement. Check each
    // exact document identity and marker again before one deletion.
    const ids = new Set([...(id ? [id] : []), ...(await owned())]);
    for (const fixture of ids) {
      assert.match(fixture, /^[1-9]\d*$/);
      await ev.eval(
        buildScript(
          "var u=UrlFromDocID(Int('${id}'));var d=OpenDoc(u);if(String(d.TopElem.code.Value)!='${code}' || StrInt(d.DocID)!='${id}')throw 'Fixture identity mismatch';DeleteDoc(u,true);return;",
          { id: fixture, code },
        ),
      );
      if (fixture === id && finalReadToken) {
        await assert.rejects(
          api.objects.patch({ id, readToken: finalReadToken, xml: "<cost_center/>" }),
          (e) => e.details.phase === "read" && e.details.writeStatus === "not_attempted",
        );
        await assert.rejects(api.objects.patch({ id, readToken: finalReadToken, xml: "<cost_center/>" }), /ReadRequired/);
        receipt.database.missingAfterRead = "not_attempted";
      }
      await assert.rejects(api.objects.get({ id: fixture }), (e) => e.details.phase === "read");
    }
    assert.deepEqual(await owned(), []);
    receipt.cleanup.ownedCostCentersAbsent = true;
    assert.equal(await packageXml(), baseline);
    receipt.cleanup.packageSchemaUnchanged = true;
  }
}
const receipt = await withStand(async (ev, r) => {
  r.files = {};
  for (const path of [
    "resources/object-patch.bs",
    "resources/object-operation.bs",
    "src/hcm/object-xml.ts",
    "src/hcm/objects.ts",
    "src/hcm/schemas.ts",
    "test/e2e/object-patch.mjs",
  ])
    r.files[path] = sha256(await readFile(new URL("../../" + path, import.meta.url)));
  await generic(ev, r);
  await database(ev, r);
});
const json = JSON.stringify(receipt, null, 2) + "\n";
if (process.env.WSHCM_PATCH_RECEIPT) await writeFile(process.env.WSHCM_PATCH_RECEIPT, json);
console.log(json);
