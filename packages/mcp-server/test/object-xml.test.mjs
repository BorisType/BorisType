import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectObjectXml } from "../build/tools/object-xml.js";

const formUrl = "x-local://wtv/wtv_cost_center.xmd";
const options = { formUrl };

test("XML inspection preserves scalar text and collects only validation paths", () => {
  const xml =
    '<?xml version="1.0"?><cost_center><name>  Привет &amp; &#x1F44B;  </name><comment><![CDATA[<tag>&raw;]]></comment><rows><row><n>-1</n></row><row><n>18446744073709551615</n></row></rows></cost_center>';
  const result = inspectObjectXml(xml, options);
  assert.equal(result.root, "cost_center");
  assert.equal(result.nodes.find((node) => node.path.join("/") === "name").text, "  Привет & 👋  ");
  assert.equal(result.nodes.find((node) => node.path.join("/") === "comment").text, "<tag>&raw;");
  assert.equal(result.nodes.filter((node) => node.path.join("/") === "rows/row").length, 2);
  assert.ok(result.nodes.filter((node) => node.path.join("/") === "rows/row").every((node) => node.count === 2));
  assert.ok(result.nodes.filter((node) => node.path.at(-1) === "n").every((node) => node.integerValid));
  assert.equal(result.nodes[0].hasElements, true);
});

for (const xml of [
  "",
  "plain text",
  "<a>",
  "<a></b>",
  "<a/><b/>",
  '<!DOCTYPE a [<!ENTITY e "expanded">]><a>&e;</a>',
  '<!DOCTYPE a SYSTEM "file:///etc/passwd"><a/>',
  '<?arbitrary form="other"?><a/>',
  "<a>&unknown;</a>",
  "<a>&#0;</a>",
  "<a>\u0001</a>",
  "<a>\ud800</a>",
  '<a injected="x"/>',
  '<a><b injected="x"/></a>',
  '<a SPXML-FORM="x-local://wtv/other.xmd"/>',
  "<a><!-- forbidden -- comment --></a>",
  "<a/>trailing-text",
  "<![CDATA[text]]><a/>",
  "<a/><![CDATA[]]>",
  "\u00a0<a/>",
  "<a><name\u00a0>x</name\u00a0></a>",
  "<a>]]></a>",
  '<?xml foo="bar"?><a/>',
  '<?xml version="2.0"?><a/>',
]) {
  test(`invalid XML is rejected before platform parsing: ${JSON.stringify(xml)}`, () => {
    assert.throws(() => inspectObjectXml(xml, options), /XML|attribute|form/i);
  });
}

test("matching root form attribute is permitted without changing the selected form", () => {
  assert.equal(inspectObjectXml(`<cost_center SPXML-FORM="${formUrl}"/>`, options).root, "cost_center");
});

test("identity is never converted through Number, and create cannot smuggle an ID", () => {
  const id = "7349577710243911718";
  const xml = `<cost_center><id>${id}</id></cost_center>`;
  assert.throws(() => inspectObjectXml(xml, options), /ID/);
  assert.equal(inspectObjectXml(xml, { formUrl, id }).id, id);
  assert.throws(() => inspectObjectXml(xml, { formUrl, id: "7349577710243911719" }), /ID/);
  assert.throws(() => inspectObjectXml("<cost_center><id>1</id><id>1</id></cost_center>", { formUrl, id: "1" }), /ID/);
});

test("native hexadecimal integer XML is accepted and IDs compare by exact value", () => {
  const id = "7349585223810462098";
  const xml = "<cost_center><id>0x65FEF8D23FAEB192</id><parent_id>0x20000000000001</parent_id></cost_center>";
  const result = inspectObjectXml(xml, { formUrl, id });
  assert.equal(result.id, id);
  assert.equal(result.nodes[1].integerValid, true);
  assert.equal(result.nodes[2].integerValid, true);
  assert.throws(() => inspectObjectXml(xml, { formUrl, id: "7349585223810462099" }), /ID/);
});

for (const value of ["NaN", "1.5", "1\u00a0", "1\uFEFF", "9223372036854775808oops", "18446744073709551616", "-9223372036854775809"]) {
  test(`invalid integer lexical/range is marked for native schema validation: ${value}`, () => {
    const result = inspectObjectXml(`<a><n>${value}</n></a>`, options);
    assert.equal(result.nodes[1].integerValid, false);
  });
}

test("mixed text is retained for native structure validation", () => {
  const result = inspectObjectXml("<a>oops<b/></a>", options);
  assert.equal(result.nodes[0].text, "oops");
});

test("XML byte, depth and node limits reject whole input", () => {
  assert.throws(() => inspectObjectXml(`<a>${"中".repeat(90000)}</a>`, options), /limit|large/i);
  assert.throws(() => inspectObjectXml("<a>".repeat(65) + "</a>".repeat(65), options), /depth/i);
  assert.throws(() => inspectObjectXml("<a>" + "<b/>".repeat(8192) + "</a>", options), /element|node/i);
});
