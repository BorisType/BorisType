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
      <item0 VALUE-TYPE="string">0002</item0>
      <item1 VALUE-TYPE="string">\n\t</item1>
    </items>
  </Result>`),
  );
  assert.deepEqual(result, { name: "  001  ", items: ["0002", "\n\t"] });
});

for (const [type, wire, expected] of [
  ["integer", " 0042 ", 42],
  ["integer", "-7", -7],
  ["real", " 1.25e2 ", 125],
  ["bool", "1", true],
  ["bool", "0", false],
  ["undefined", "", undefined],
  ["null", "", undefined],
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
  const content = '  000123\nПривет & <tag> "quote"\t';
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: false, parseTagValue: false });
  const parsed = parser.parse(renderRequest("tools", "put_url_text_server", ["x-local://wt/file.bs", content, 42, 1.5, true, false]));
  const args = parsed.Envelope.Body.CallMethod.ArgData;
  assert.equal(args["arg-1"]["#text"], content);
  assert.equal(args["arg-1"]["@_VALUE-TYPE"], "string");
  assert.equal(args["arg-2"]["@_VALUE-TYPE"], "integer");
  assert.equal(args["arg-3"]["@_VALUE-TYPE"], "real");
  assert.equal(args["arg-4"]["@_VALUE-TYPE"], "bool");
});
