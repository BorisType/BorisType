import assert from "node:assert/strict";
import vm from "node:vm";
export function packagePlatform(extra = {}) {
  const files = new Map();
  let saved = [
    {
      id: "baseline",
      name: "neighbor",
      objects: [],
      files: [],
      custom_templates: [],
      process_custom_templates: false,
      process_access_roles: false,
    },
  ];
  let saves = 0,
    calls = 0;
  function collection(rows, kind) {
    const a = rows.map((v) => (kind === "schema" ? schema(v) : v));
    Object.defineProperties(a, {
      ChildNum: { get: () => a.length },
      AddChild: {
        value: () => {
          const v =
            kind === "schema"
              ? schema({
                  id: "auto",
                  name: "",
                  objects: [],
                  files: [],
                  custom_templates: [],
                  process_custom_templates: false,
                  process_access_roles: false,
                })
              : {};
          a.push(v);
          return v;
        },
      },
      GetChildByKey: {
        value: (key) => {
          const v = a.find((v) => String(v.id) === String(key));
          if (!v) throw Error("Not found");
          return v;
        },
      },
      DeleteChildByKey: {
        value: (key) => {
          const i = a.findIndex((v) => String(v.id) === String(key));
          if (i >= 0) a.splice(i, 1);
        },
      },
      Clear: { value: () => a.splice(0) },
    });
    return a;
  }
  function schema(v) {
    return { ...v, objects: collection(v.objects), files: collection(v.files), custom_templates: collection(v.custom_templates) };
  }
  function doc(rows) {
    const top = collection(rows, "schema");
    top.GetXml = () => JSON.stringify(top);
    return {
      TopElem: top,
      Save: () => {
        saved = JSON.parse(JSON.stringify(top));
        saves++;
      },
    };
  }
  const ctx = {
    ParseJson: JSON.parse,
    EncodeJson: JSON.stringify,
    StrCharCount: (v) => String(v).length,
    String,
    Int: BigInt,
    StrSignedInt: String,
    StrInt: String,
    ArrayCount: (a) => a.length,
    ArraySelectAll: (a) => a,
    DefaultDb: "wt_data",
    OpenDoc: () => doc(saved),
    OpenNewDoc: () => doc([]),
    UrlToFilePath: (v) => v,
    CreateDirectory: () => {},
    IsDirectory: () => true,
    ObtainDirectory: () => {},
    FilePathExists: (p) => files.has(p),
    PutFileData: (p, v) => files.set(p, v),
    LoadFileData: (p) => {
      if (!files.has(p)) throw Error("missing");
      return files.get(p);
    },
    StrBegins: (a, b) => a.startsWith(b),
    StrContains: (a, b) => a.includes(b),
    StrLowerCase: (s) => s.toLowerCase(),
    StrLeftRange: (s, n) => s.slice(0, n),
    tools: {
      get_cur_user_id: () => 1n,
      random_string: () => "target-identity-123456789",
      add_object_to_package: (_a, id, _b, p, opts) => {
        assert.equal(opts.apply_to_all, true);
        p.objects.push({ id: String(id), name: "exact", type: "cost_center", modify: true });
        return { error: 0 };
      },
    },
  };
  return {
    files,
    get saved() {
      return saved;
    },
    get saves() {
      return saves;
    },
    get calls() {
      return calls;
    },
    mutate: () => {
      saved[0].name = "concurrent";
    },
    evaluator: {
      eval: async (code) => {
        calls++;
        return vm.runInNewContext(`(function(){${code}})()`, Object.assign(ctx, extra, { tools: { ...ctx.tools, ...extra.tools } }));
      },
    },
  };
}

import { objectPackage } from "./package-fixtures.mjs";
export function packageExportPlatform() {
  let p;
  p = packagePlatform({
    XQuery: () => [],
    CodeLiteral: JSON.stringify,
    FileSize: (path) => Buffer.byteLength(p.files.get(path)),
    Base64Encode: (b) => Buffer.from(b).toString("base64"),
    LoadFileDataRange: (path, a, b) => Buffer.from(p.files.get(path)).subarray(a, b),
    tools: {
      create_list_package: (url) => {
        p.files.set(url, objectPackage());
        return { error: 0, error_text: "", counter: 1 };
      },
    },
  });
  return p;
}
