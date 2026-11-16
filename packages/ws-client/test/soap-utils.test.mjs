import assert from "node:assert/strict";
import { test } from "node:test";
import { XMLParser } from "fast-xml-parser";
import { parseResponse, renderRequest } from "../build/soap-utils.js";
import { WshcmException } from "../build/exceptions.js";

function response(result) {
  return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><CallMethodResponse><ResultData>${result}</ResultData></CallMethodResponse></soap:Body></soap:Envelope>`;
}

for (const [wire, expected] of [
  ["  first\nlast  \n", "  first\nlast  \n"],
  ["000123", "000123"],
  ["1e3", "1e3"],
  ["false", "false"],
  ["\n\t", "\n\t"],
  ["", ""],
  ["Привет 👋 &amp; &lt;tag&gt; &#13;&#10;", "Привет 👋 & <tag> \r\n"],
  ["<![CDATA[  000123 <tag> & text\n]]>", "  000123 <tag> & text\n"],
]) {
  test(`SOAP string preserves text: ${JSON.stringify(expected)}`, () => {
    assert.equal(parseResponse(response(`<Result VALUE-TYPE="string">${wire}</Result>`)), expected);
  });
}

test("SOAP strings retain their content when nested in objects and arrays", () => {
  const result = parseResponse(
    response(`<Result VALUE-TYPE="Object">
    <name VALUE-TYPE="string">  001  </name>
    <items VALUE-TYPE="Array">
      <e VALUE-TYPE="string">0002</e>
      <e VALUE-TYPE="string">\n\t</e>
    </items>
  </Result>`),
  );
  assert.deepEqual(result, { name: "  001  ", items: ["0002", "\n\t"] });
});

for (const [type, wire, expected] of [
  ["integer", " 0042 ", 42n],
  ["integer", "-7", -7n],
  ["real", " 1.25e2 ", 125],
  ["bool", "1", true],
  ["bool", "0", false],
  ["undefined", "", undefined],
  ["null", "", null],
]) {
  test(`SOAP typed value remains supported: ${type} ${JSON.stringify(wire)}`, () => {
    assert.equal(parseResponse(response(`<Result VALUE-TYPE="${type}">${wire}</Result>`)), expected);
  });
}

test("SOAP Fault still becomes an exception", () => {
  const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Access denied &amp; unavailable</faultstring></soap:Fault></soap:Body></soap:Envelope>`;
  assert.throws(() => parseResponse(xml), /ERR: \(soap:Server\) Access denied & unavailable/);
});

test("unknown typed values and missing Result remain errors", () => {
  assert.throws(() => parseResponse(response('<Result VALUE-TYPE="unknown"/>')), WshcmException);
  assert.throws(() => parseResponse(response('<Other VALUE-TYPE="string"/>')), /Result element not found/);
});

test("request strings survive XML serialization without trimming or coercion", () => {
  const content = '  000123\r\nПривет & <tag> "quote"\t\rend &#13;';
  const parser = new XMLParser({
    htmlEntities: true,
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: false,
    parseTagValue: false,
  });
  const parsed = parser.parse(renderRequest("tools", "put_url_text_server", ["x-local://wt/file.bs", content, 42, 1.5, true, false]));
  const args = parsed.Envelope.Body.CallMethod.ArgData;
  assert.equal(args["arg-1"]["#text"], content);
  assert.equal(args["arg-1"]["@_VALUE-TYPE"], "string");
  assert.equal(args["arg-2"]["@_VALUE-TYPE"], "real");
  assert.equal(args["arg-3"]["@_VALUE-TYPE"], "real");
  assert.equal(args["arg-4"]["@_VALUE-TYPE"], "bool");
});

for (const [wire, expected] of [
  ["0", 0n],
  ["9007199254740993", 9007199254740993n],
  ["9223372036854775807", 9223372036854775807n],
  ["-9223372036854775808", -9223372036854775808n],
  ["0xFFDFFFFFFFFFFFFF", -9007199254740993n],
  ["0x8000000000000000", -9223372036854775808n],
  ["0xffffffffffffffff", -1n],
]) {
  test(`SOAP integers preserve signed int64: ${wire}`, () => {
    assert.equal(parseResponse(response(`<Result VALUE-TYPE="integer">${wire}</Result>`)), expected);
  });
}

for (const [wire, expected] of [
  ["nan", NaN],
  ["inf", Infinity],
  ["-inf", -Infinity],
  ["-0", -0],
]) {
  test(`SOAP real recognizes native token ${wire}`, () => {
    assert.ok(Object.is(parseResponse(response(`<Result VALUE-TYPE="real">${wire}</Result>`)), expected));
  });
}

test("SOAP arrays decode repeated e, single e and empty arrays recursively", () => {
  assert.deepEqual(
    parseResponse(
      response(
        `<Result VALUE-TYPE="Array"><e VALUE-TYPE="integer">1</e><e VALUE-TYPE="Object"><nested VALUE-TYPE="Array"><e VALUE-TYPE="null"/></nested><empty VALUE-TYPE="Array"/></e></Result>`,
      ),
    ),
    [1n, { nested: [null], empty: [] }],
  );
});

test("SOAP object keys preserve namespace prefixes and prototype names safely", () => {
  const result = parseResponse(
    response(
      `<Result VALUE-TYPE="Object" xmlns:p="urn:test"><p:id VALUE-TYPE="integer">1</p:id><id VALUE-TYPE="integer">2</id><__proto__ VALUE-TYPE="Object"><polluted VALUE-TYPE="bool">1</polluted></__proto__><constructor VALUE-TYPE="string">own</constructor></Result>`,
    ),
  );
  assert.deepEqual(Object.keys(result), ["p:id", "id", "__proto__", "constructor"]);
  assert.equal(result["p:id"], 1n);
  assert.equal(result.id, 2n);
  assert.deepEqual(result.__proto__, { polluted: true });
  assert.equal(result.constructor, "own");
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal({}.polluted, undefined);
});

for (const result of [
  '<Result VALUE-TYPE="integer"/>',
  '<Result VALUE-TYPE="integer">12oops</Result>',
  '<Result VALUE-TYPE="integer">1.5</Result>',
  '<Result VALUE-TYPE="integer">9223372036854775808</Result>',
  '<Result VALUE-TYPE="integer">-9223372036854775809</Result>',
  '<Result VALUE-TYPE="integer">0x10000000000000000</Result>',
  '<Result VALUE-TYPE="real"/>',
  '<Result VALUE-TYPE="real">1.5tail</Result>',
  '<Result VALUE-TYPE="real">1e999</Result>',
  '<Result VALUE-TYPE="bool"/>',
  '<Result VALUE-TYPE="bool">2</Result>',
  '<Result VALUE-TYPE="bool">true</Result>',
  '<Result VALUE-TYPE="string"><raw/></Result>',
  '<Result VALUE-TYPE="undefined">text</Result>',
  '<Result VALUE-TYPE="null"><raw/></Result>',
  '<Result VALUE-TYPE="Object">text</Result>',
  '<Result VALUE-TYPE="Object"><key VALUE-TYPE="string"/><key VALUE-TYPE="string"/></Result>',
  '<Result VALUE-TYPE="Array"><other VALUE-TYPE="integer">1</other></Result>',
  '<Result VALUE-TYPE="date">2026-11-16</Result>',
  "<Result/>",
  "<Result>untyped</Result>",
]) {
  test(`SOAP rejects malformed or unsupported typed result: ${result}`, () => {
    assert.throws(() => parseResponse(response(result)), WshcmException);
  });
}

test("SOAP rejects malformed XML and missing response result data", () => {
  for (const xml of [
    "",
    "not xml",
    "<Envelope>",
    response('<Result VALUE-TYPE="string">text</Result').replace("</ResultData>", ""),
    "<Envelope><Body/></Envelope>",
  ]) {
    assert.throws(() => parseResponse(xml), WshcmException);
  }
});

const requestParser = new XMLParser({ htmlEntities: true, ignoreAttributes: false, trimValues: false, parseTagValue: false });
function requestArguments(values) {
  return requestParser.parse(renderRequest("tools", "fixture", values))["soap:Envelope"]["soap:Body"].CallMethod.ArgData;
}

test("SOAP request encodes recursive typed values and int64 bits without JSON coercion", () => {
  const args = requestArguments([
    42n,
    42,
    -7n,
    -9223372036854775808n,
    9223372036854775807n,
    { items: [null, undefined, { flag: true, text: "  0001\r\n" }], empty: [], record: {} },
  ]);
  assert.deepEqual(args["arg-0"], { "#text": "42", "@_VALUE-TYPE": "integer" });
  assert.deepEqual(args["arg-1"], { "#text": "42", "@_VALUE-TYPE": "real" });
  assert.equal(args["arg-2"]["#text"], "18446744073709551609");
  assert.equal(args["arg-3"]["#text"], "9223372036854775808");
  assert.equal(args["arg-4"]["#text"], "9223372036854775807");
  assert.equal(args["arg-5"]["@_VALUE-TYPE"], "Object");
  assert.equal(args["arg-5"].items["@_VALUE-TYPE"], "Array");
  const items = args["arg-5"].items.e;
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], { "@_VALUE-TYPE": "null" });
  assert.deepEqual(items[1], { "@_VALUE-TYPE": "undefined" });
  assert.equal(items[2]["@_VALUE-TYPE"], "Object");
  assert.deepEqual(items[2].flag, { "#text": "1", "@_VALUE-TYPE": "bool" });
  assert.deepEqual(items[2].text, { "#text": "  0001\r\n", "@_VALUE-TYPE": "string" });
  assert.deepEqual(args["arg-5"].empty, { "@_VALUE-TYPE": "Array" });
  assert.deepEqual(args["arg-5"].record, { "@_VALUE-TYPE": "Object" });
});

test("SOAP real requests preserve negative zero and nonfinite tokens", () => {
  const args = requestArguments([-0, NaN, Infinity, -Infinity]);
  assert.deepEqual(
    [0, 1, 2, 3].map((index) => [args[`arg-${index}`]["@_VALUE-TYPE"], args[`arg-${index}`]["#text"]]),
    [
      ["real", "-0"],
      ["real", "nan"],
      ["real", "inf"],
      ["real", "-inf"],
    ],
  );
});

test("SOAP record requests serialize own fields including prototype names", () => {
  const record = Object.assign(Object.create(null), { own: 1n });
  Object.defineProperty(record, "__proto__", { value: "safe", enumerable: true });
  const xml = renderRequest("tools", "fixture", [record]);
  assert.match(xml, /<__proto__ VALUE-TYPE="string">safe<\/__proto__>/);
  assert.match(xml, /<own VALUE-TYPE="integer">1<\/own>/);
  const shared = { value: 1n };
  assert.doesNotThrow(() => renderRequest("tools", "fixture", [[shared, shared]]));
});

test("SOAP requests reject cycles, nonrecords, unsupported values and invalid XML field names", () => {
  const cycle = {};
  cycle.self = cycle;
  const symbolKey = { [Symbol("field")]: 1 };
  const sparse = [];
  sparse.length = 1;
  for (const invalid of [
    9223372036854775808n,
    -9223372036854775809n,
    cycle,
    new Date(),
    new Map(),
    new Uint8Array(),
    Object.create({ inherited: true }),
    () => 1,
    Symbol("value"),
    symbolKey,
    { "": 1 },
    { "has space": 1 },
    { "p:name": 1 },
    { "@_value": 1 },
    { "#text": 1 },
    { nested: { fn() {} } },
    Object.assign([], { extra: true }),
    sparse,
  ]) {
    assert.throws(() => renderRequest("tools", "fixture", [invalid]), WshcmException);
  }
});

test("SOAP record keys cannot inject XML markup or attributes", () => {
  for (const key of ["x/><injected", 'x attribute="value"', "x\nattribute='value'", "x><child/></x><y"]) {
    assert.throws(() => renderRequest("tools", "fixture", [{ [key]: true }]), WshcmException);
  }
});

test("SOAP returned Fault fields remain ordinary data", () => {
  assert.deepEqual(
    parseResponse(
      response(
        '<Result VALUE-TYPE="Object"><Fault VALUE-TYPE="Object"><faultstring VALUE-TYPE="string">data</faultstring></Fault></Result>',
      ),
    ),
    { Fault: { faultstring: "data" } },
  );
});

test("SOAP record requests reject accessors without executing them", () => {
  let reads = 0;
  const object = Object.defineProperty({}, "value", {
    enumerable: true,
    get() {
      reads++;
      return 1;
    },
  });
  assert.throws(() => renderRequest("tools", "fixture", [object]), WshcmException);
  assert.equal(reads, 0);
});

for (const [type, wire] of [
  ["integer", "1&#0;2"],
  ["real", "1&#0;.5"],
  ["bool", "&#0;1"],
  ["null", "&#0;"],
  ["undefined", "&#0;"],
  ["string", "a&#0;b"],
]) {
  test(`SOAP rejects invalid character references before ${type} interpretation`, () => {
    assert.throws(() => parseResponse(response(`<Result VALUE-TYPE="${type}">${wire}</Result>`)), WshcmException);
  });
}

test("SOAP rejects invalid XML 1.0 numeric references and malformed reference syntax", () => {
  for (const wire of [
    "&#1;",
    "&#xB;",
    "&#13.0;",
    "&#xD800;",
    "&#55296;",
    "&#xDFFF;",
    "&#xFFFE;",
    "&#xFFFF;",
    "&#x110000;",
    "&#9999999999999999999999;",
    "&#;",
    "&#x;",
    "&#-1;",
    "&#X20;",
    "&#12",
    "&#x0",
  ]) {
    assert.throws(() => parseResponse(response(`<Result VALUE-TYPE="string">${wire}</Result>`)), WshcmException, wire);
  }
  assert.throws(() => parseResponse(response('<Result VALUE-TYPE="string" extra="&#0;">text</Result>')), WshcmException);
});

test("SOAP rejects forbidden raw XML 1.0 code points on input and output", () => {
  for (const invalid of ["\0", "\x01", "\x08", "\x0b", "\x0c", "\x0e", "\ud800", "\udfff", "\ufffe", "\uffff"]) {
    assert.throws(() => parseResponse(response(`<Result VALUE-TYPE="string">a${invalid}b</Result>`)), WshcmException);
    assert.throws(() => parseResponse(response(`<Result VALUE-TYPE="string"><![CDATA[${invalid}]]></Result>`)), WshcmException);
    assert.throws(() => renderRequest("tools", "fixture", [{ nested: [invalid] }]), WshcmException);
    assert.throws(() => renderRequest(`tools${invalid}`, "fixture", []), WshcmException);
  }
});

test("SOAP preserves valid XML 1.0 boundary characters and escaped entity-looking string data", () => {
  const value = "\t\n\r \ud7ff\ue000\ufffd\u{10000}\u{10ffff} &#0; &#xD800;";
  assert.equal(
    parseResponse(
      response('<Result VALUE-TYPE="string">&#9;&#10;&#13;&#32;&#xD7FF;&#xE000;&#xFFFD;&#x10000;&#x10FFFF; &amp;#0; &amp;#xD800;</Result>'),
    ),
    value,
  );
  assert.equal(requestArguments([value])["arg-0"]["#text"], value);
});

test("SOAP treats entity-looking CDATA, comments and processing instructions as literal XML content", () => {
  assert.equal(
    parseResponse(response('<Result VALUE-TYPE="string"><![CDATA[&#0; &#xD800; &#bad;]]><!-- &#0; --></Result>')),
    "&#0; &#xD800; &#bad;",
  );
  assert.equal(parseResponse(response('<Result VALUE-TYPE="integer">1<!-- &#0; -->2</Result>')), 12n);
  assert.equal(parseResponse('<?literal text="&#0;"?>' + response('<Result VALUE-TYPE="string">safe</Result>')), "safe");
});
