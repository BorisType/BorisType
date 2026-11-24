import assert from "node:assert/strict";
import { test } from "node:test";
import { readStartupXml } from "./fixtures/startup-xml-reader.mjs";

function read(xml, id = "9007199254740993") {
  return readStartupXml(xml, "object", id);
}

test("startup XML reads the current UTF-8 file into ordered, decoded patch nodes", () => {
  const formUrl = "x-local://wtv/wtv_object.xmd";
  const plan = read(
    '\uFEFF<?xml version="1.0" encoding="utf-8"?>\n<!-- startup -->\n<object SPXML-FORM="' +
      formUrl +
      '" bt-mode="merge"><id>0x20000000000001</id><group><row bt-mode="replace-array"><key>  Кир &amp; &#x1F44B;  </key></row>' +
      '<row><key><![CDATA[<two>&raw]]></key></row></group><group bt-mode="clear"/></object>',
  );
  assert.equal(plan.root, "object");
  assert.equal(plan.formUrl, formUrl);
  assert.deepEqual(
    Array.from(plan.nodes, (n) => [n.parentIndex, n.name, n.count, n.mode]),
    [
      [-1, "object", 1, "merge"],
      [0, "id", 1, "auto"],
      [0, "group", 2, "auto"],
      [2, "row", 2, "replace-array"],
      [3, "key", 1, "auto"],
      [2, "row", 2, "auto"],
      [5, "key", 1, "auto"],
      [0, "group", 2, "clear"],
    ],
  );
  assert.equal(plan.nodes[1].integer, "9007199254740993");
  assert.equal(plan.nodes[4].text, "  Кир & 👋  ");
  assert.equal(plan.nodes[6].text, "<two>&raw");
  assert.equal(read("<object/>").formUrl, "");
});

test("scalar spellings preserve native whole-second clocks and signed/unsigned 64-bit integers", () => {
  const values = [
    ["+00042", "42", true, ""],
    ["-9223372036854775808", "-9223372036854775808", true, ""],
    ["0xffffffffffffffff", "18446744073709551615", false, ""],
    ["18446744073709551616", "", true, ""],
    ["-9223372036854775809", "", true, ""],
    ["-1.75e-2", "", true, ""],
    ["1z", "", false, ""],
    ["2024-02-29", "", false, "2024-02-29T00:00:00"],
    ["2024-02-29T13:07:01.000Z", "", false, "2024-02-29T13:07:01"],
    ["1-01-01T00:00:00+00:00", "", false, "0001-01-01T00:00:00"],
    ["2023-02-29", "", false, ""],
    ["2024-02-29T13:07:60", "", false, ""],
    ["2024-02-29T13:07:01+06:00", "", false, ""],
    ["2024-02-29T13:07:01.01Z", "", false, ""],
  ];
  for (const [value, integer, realValid, date] of values) {
    const node = read("<object><field>" + value + "</field></object>").nodes[1];
    assert.equal(node.integer, integer, value);
    assert.equal(node.integerValid, integer !== "", value);
    assert.equal(node.realValid, realValid, value);
    assert.equal(node.date, date, value);
  }
});

test("invalid identity, controls, XML and resource limits fail before loading a document", () => {
  for (const xml of [
    "<wrong/>",
    "<object><id>9007199254740992</id></object>",
    "<object><id>9007199254740993</id><id>9007199254740993</id></object>",
    '<object><id bt-mode="merge">9007199254740993</id></object>',
    '<object bt-mode="replace"/>',
    '<object><field bt-mode="auto"/></object>',
    '<object><field bt-mode="clear"> </field></object>',
    '<object><field other="data"/></object>',
    '<object a="x" a="y"/>',
    '<object SPXML-FORM="file:///tmp/a.xmd"/>',
    '<object SPXML-FORM="x-local://wt/a.xmd;form=x"/>',
    '<!DOCTYPE object [<!ENTITY x SYSTEM "file:///tmp/a">]><object/>',
    "<?untrusted?><object/>",
    "<object/><object/>",
    "<object><field></object>",
    "<object>]]></object>",
    "<object>&unknown;</object>",
    "<object>&#xD800;</object>",
    "<object>\x01</object>",
    "<object><!-- bad -- comment --></object>",
    '<?xml version="1.1"?><object/>',
    '<?xml version="1.0" encoding="ISO-8859-1"?><object/>',
    "<object/>oops",
    "<object broken=>",
    "<object>" + "<d>".repeat(64) + "</d>".repeat(64) + "</object>",
    "<object>" + "<a/>".repeat(8192) + "</object>",
    "<object>" + "中".repeat(90000) + "</object>",
  ]) {
    assert.throws(() => read(xml), undefined, xml.slice(0, 100));
  }
});

test("startup scalar default is explicit, order independent and separate from bt-mode", () => {
  const nodes = read('<object><name default="true"/><other default="false"/></object>').nodes;
  assert.equal(nodes[1].mode, "default");
  assert.equal(nodes[2].mode, "auto");
  for (const xml of [
    '<object default="true"/>',
    '<object><id default="true">9007199254740993</id></object>',
    '<object><name default="yes"/></object>',
    '<object><name bt-mode="clear" default="true"/></object>',
    '<object><name default="true" bt-mode="clear"/></object>',
    '<object><name bt-mode="default"/></object>',
  ])
    assert.throws(() => read(xml), /default|mode/i);
});

test("raw UTF-16 and UTF-32 XML without a declaration is rejected before reader encoding detection", () => {
  const ascii = "<object/>";
  for (const width of [2, 4]) {
    for (const littleEndian of [true, false]) {
      const bytes = Buffer.alloc(ascii.length * width);
      for (let i = 0; i < ascii.length; i++) bytes[i * width + (littleEndian ? 0 : width - 1)] = ascii.charCodeAt(i);
      assert.throws(() => read(bytes), /UTF-8/);
    }
  }
});
