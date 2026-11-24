import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const source = new URL("../../resources/startup-xml.bs", import.meta.url);
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
export const readStartupXml = platform.BtReadStartupXml;
