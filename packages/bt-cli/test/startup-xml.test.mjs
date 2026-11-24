import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";

const source = new URL("../resources/startup-xml.bs", import.meta.url);
// The local fixture adapts the SDK's SAX dependency to the stock CLR reader interface.
// The CLR parser, overload selection, entity handling and stream closure are exercised on HCM.
const require = createRequire(import.meta.url);
const { SaxesParser } = createRequire(require.resolve("@boristype/ws-client"))("saxes");
function xmlReader(xml) {
  const events = [];
  const parser = new SaxesParser();
  let depth = 0;
  const emit = (kind, value = "", extra = {}) => events.push({ NodeType: { ToString: () => kind }, Value: value, Depth: depth, ...extra });
  parser.on("doctype", () => {
    throw Error("DTD prohibited");
  });
  parser.on("xmldecl", (decl) => emit("XmlDeclaration", "", { GetAttribute: (name) => decl[name] }));
  parser.on("opentag", (tag) => {
    const attrs = Object.entries(tag.attributes);
    let i = 0;
    emit("Element", "", {
      Name: tag.name,
      IsEmptyElement: tag.isSelfClosing,
      MoveToFirstAttribute() {
        i = -1;
        return this.MoveToNextAttribute();
      },
      MoveToNextAttribute() {
        if (++i === attrs.length) return false;
        [this.Name, this.Value] = attrs[i];
        return true;
      },
      MoveToElement() {
        this.Name = tag.name;
        this.Value = "";
      },
    });
    depth++;
  });
  parser.on("closetag", (tag) => {
    depth--;
    if (!tag.isSelfClosing) emit("EndElement", "", { Name: tag.name });
  });
  parser.on("text", (value) => emit("Text", value));
  parser.on("cdata", (value) => emit("CDATA", value));
  parser.on("processinginstruction", () => emit("ProcessingInstruction"));
  parser.on("comment", () => emit("Comment"));
  parser.write(xml).close();
  let next = 0;
  return {
    Read() {
      if (next === events.length) return false;
      Object.assign(this, events[next++]);
      return true;
    },
    Close() {},
  };
}

const platform = vm.createContext({
  ArrayCount: (a) => a.length,
  StrLen: (s) => Buffer.byteLength(s),
  DataFromHex: (hex) => Buffer.from(hex, "hex"),
  StrOptSubStrPosB(s, pattern) {
    const index = Buffer.from(s).indexOf(pattern);
    return index < 0 ? undefined : index;
  },
  StrRangePos: (s, start, end) => Buffer.from(s).subarray(start, end).toString(),
  StrLowerCase: (s) => s.toLowerCase(),
  StrBegins: (s, prefix) => s.startsWith(prefix),
  StrInt: (n) => BigInt.asUintN(64, BigInt(n)).toString(),
  StrSignedInt: (n) => BigInt.asIntN(64, BigInt(n)).toString(),
  Trim: (s) => s.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, ""),
  Int(s) {
    const n = BigInt.asIntN(64, BigInt(s));
    return Number.isSafeInteger(Number(n)) ? Number(n) : n;
  },
  tools: {
    dotnet_host: {
      Object: {
        GetAssembly: () => ({
          CreateClassObject(type) {
            if (type === "System.IO.MemoryStream")
              return {
                Write(s) {
                  this.xml = s;
                },
                Close() {},
              };
            if (type === "System.Xml.XmlReaderSettings") return {};
            throw Error(type);
          },
          CallClassStaticMethod(type, method, args) {
            if (type === "System.Text.RegularExpressions.Regex") {
              const match = new RegExp(args[1]).exec(args[0]);
              if (method === "IsMatch") return !!match;
              return { Success: !!match, Groups: { get_Item: (n) => ({ Value: match[n] ?? "" }) } };
            }
            const [stream] = args;
            assert.equal(type, "System.Xml.XmlReader");
            assert.equal(method, "Create");
            return xmlReader(stream.xml);
          },
        }),
      },
    },
  },
});
vm.runInContext(readFileSync(source, "utf8"), platform);
function read(xml, id = "9007199254740993") {
  assert.equal(typeof platform.BtReadStartupXml, "function");
  return platform.BtReadStartupXml(xml, "object", id);
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
  assert.equal(typeof platform.BtReadStartupXml, "function");
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
