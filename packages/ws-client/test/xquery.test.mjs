import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
const adapter = await import("../build/xquery.js").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});

// This executes the actual BS template in a JS double; native C checks are separate.
function evaluatorFor(items, observe = () => {}) {
  return {
    async eval(code) {
      const context = {
        XQuery(query) {
          observe(query);
          return items;
        },
        ArrayRange: (array, start, count) => array.slice(start, start + count),
        ArraySelectAll: (array) => Array.from(array),
        ArrayCount: (array) => array.length,
        DataType(value) {
          if (value === null) return "null";
          if (typeof value === "bigint") return "integer";
          if (typeof value === "number") return "real";
          if (typeof value === "boolean") return "bool";
          return typeof value;
        },
        ObjectType(value) {
          return value?.__xml ? "XmElem" : Array.isArray(value) ? "JsArray" : "JsObject";
        },
        GetObjectProperty: (value, name) => value[name],
        EncodeJson: (value) => JSON.stringify(value, (_, child) => (typeof child === "bigint" ? child.toString() : child)) ?? "{}",
        StrCharCount: (value) => [...value].length,
      };
      const value = vm.runInNewContext(`(function() { ${code}\n})()`, context, { timeout: 2000 });
      // Simulate the SOAP metadata integer; row integers supplied to the double use bigint.
      return structuredClone({ ...value, returnedRows: BigInt(value.returnedRows) });
    },
  };
}

function xml(name, type, value, children = [], multi = false) {
  const node = { __xml: true, Name: name, Type: type, ChildNum: children.length, IsMultiElem: multi };
  Object.defineProperty(node, "Value", {
    get() {
      assert.equal(children.length, 0);
      assert.notEqual(type, "");
      return value;
    },
  });
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    node[index] = child;
    if (!Object.hasOwn(node, child.Name)) Object.defineProperty(node, child.Name, { value: { IsMultiElem: child.IsMultiElem } });
  }
  return node;
}

test("public helper projects native typed XML fields and escaped strings", async () => {
  assert.equal(typeof adapter.executeXQuery, "function");
  const row = xml("row", "", undefined, [
    xml("id", "integer", 9007199254740993n),
    xml("score", "real", 1),
    xml("name", "string", 'Я中👋\r\n"\\'),
    xml("missing", "integer", null),
    xml("empty", "string", ""),
    xml("nested", "string", undefined, [xml("flag", "bool", true)]),
    xml("blank", "", undefined),
    xml("item", "string", "one"),
    xml("item", "string", "two"),
    xml("singleton", "integer", 4n, [], true),
  ]);
  assert.deepEqual(await adapter.executeXQuery(evaluatorFor([row]), "sql:SELECT ..."), {
    rows: [
      {
        id: 9007199254740993n,
        score: 1,
        name: 'Я中👋\r\n"\\',
        missing: null,
        empty: "",
        nested: { flag: true },
        blank: {},
        item: ["one", "two"],
        singleton: [4n],
      },
    ],
    returnedRows: 1,
    truncated: false,
    limitReason: null,
  });
});

test("query reaches XQuery unchanged as data and metadata bounds whole rows", async () => {
  const query = "sql: SELECT '\"\\\r\n${query}中👋\u2028\u2029";
  let received;
  assert.deepEqual(
    await adapter.executeXQuery(
      evaluatorFor([1n, 2n, 3n], (value) => {
        received = value;
      }),
      query,
      { maxRows: 2 },
    ),
    {
      rows: [1n, 2n],
      returnedRows: 2,
      truncated: true,
      limitReason: "rows",
    },
  );
  assert.equal(received, query);
  assert.deepEqual(await adapter.executeXQuery(evaluatorFor([]), "empty"), {
    rows: [],
    returnedRows: 0,
    truncated: false,
    limitReason: null,
  });
  assert.equal((await adapter.executeXQuery(evaluatorFor(Array.from({ length: 101 }, () => 1n)), "defaults")).returnedRows, 100);
});

test("ordinary records, arrays and hazardous field names reconstruct safely", async () => {
  const record = JSON.parse('{"__proto__":{"polluted":"safe"},"bad alias":"x","entries":[1,2],"constructor":null}');
  const result = await adapter.executeXQuery(evaluatorFor([record, undefined, null, false, -0]), "plain");
  assert.deepEqual(result.rows, [record, undefined, null, false, -0]);
  assert.equal(Object.getPrototypeOf(result.rows[0]), Object.prototype);
  assert.equal(Object.hasOwn(result.rows[0], "__proto__"), true);
  assert.equal({}.polluted, undefined);
});

test("output truncation excludes an entire oversized row", async () => {
  const result = await adapter.executeXQuery(evaluatorFor(["ok", "x".repeat(65000), "later"]), "bounded");
  assert.deepEqual(result, { rows: ["ok"], returnedRows: 1, truncated: true, limitReason: "output" });
});

test("input validation happens before invoking the evaluator", async () => {
  const evaluator = {
    eval() {
      assert.fail("invalid input reached server");
    },
  };
  for (const query of ["", "  ", "\0", "\ud800", "中".repeat(21846), 1]) {
    await assert.rejects(adapter.executeXQuery(evaluator, query), /query/i);
  }
  for (const maxRows of [0, -1, 1.5, 1001, NaN, "1", null]) {
    await assert.rejects(adapter.executeXQuery(evaluator, "valid", { maxRows }), /maxRows/i);
  }
});

test("depth and total projected values have finite limits", async () => {
  let deep = 1n;
  for (let i = 0; i < 34; i++) deep = [deep];
  await assert.rejects(adapter.executeXQuery(evaluatorFor([deep]), "depth"), /depth/i);
  await assert.rejects(adapter.executeXQuery(evaluatorFor([Array.from({ length: 10001 }, () => 1n)]), "values"), /values/i);
});

test("malformed carrier/envelope is rejected without coercion", async () => {
  const valid = { rows: [], returnedRows: 0n, truncated: false, limitReason: null };
  const invalid = [
    null,
    "",
    { ...valid, returnedRows: 1n },
    { ...valid, returnedRows: 0 },
    { ...valid, truncated: true },
    { ...valid, extra: true },
    { ...valid, rows: ["not encoded"], returnedRows: 1n },
    { ...valid, rows: ["123"], returnedRows: 1n },
    {
      ...valid,
      rows: [
        {
          entries: [
            ['"x"', 1n],
            ['"x"', 2n],
          ],
        },
      ],
      returnedRows: 1n,
    },
    { ...valid, rows: [{ entries: [], extra: true }], returnedRows: 1n },
    { ...valid, rows: [{ entries: [['"x"']] }], returnedRows: 1n },
    { ...valid, rows: [{ entries: [["1", 1n]] }], returnedRows: 1n },
    { ...valid, rows: [], truncated: true, limitReason: "rows" },
    { ...valid, rows: ['"' + "x".repeat(262145) + '"'], returnedRows: 1n },
  ];
  for (const response of invalid) {
    await assert.rejects(
      adapter.executeXQuery(
        {
          async eval() {
            return response;
          },
        },
        "valid",
      ),
      /XQuery|carrier|response|limit|encoded/i,
    );
  }
});

test("server errors propagate with one attempt", async () => {
  let calls = 0;
  const expected = new Error("native failure");
  await assert.rejects(
    adapter.executeXQuery(
      {
        async eval() {
          calls++;
          throw expected;
        },
      },
      "valid",
    ),
    (error) => error === expected,
  );
  assert.equal(calls, 1);
});

test("carrier arrays cannot smuggle sparse fields or accessors", async () => {
  const envelope = (rows) => ({ rows, returnedRows: BigInt(rows.length), truncated: false, limitReason: null });
  const sparse = new Array(1);
  const extra = [];
  extra.unknown = 1;
  const accessor = [];
  Object.defineProperty(accessor, "0", {
    get() {
      assert.fail("carrier getter must not execute");
    },
    enumerable: true,
  });
  const pair = ['"key"', 1n];
  Object.defineProperty(pair, "0", {
    get() {
      assert.fail("entry getter must not execute");
    },
    enumerable: true,
  });
  for (const response of [
    envelope(sparse),
    envelope(extra),
    envelope(accessor),
    envelope([{ entries: sparse }]),
    envelope([{ entries: extra }]),
    envelope([{ entries: [pair] }]),
  ]) {
    await assert.rejects(
      adapter.executeXQuery(
        {
          async eval() {
            return response;
          },
        },
        "valid",
      ),
      /carrier|response/i,
    );
  }
});

test("decoded JSON size is bounded even when escaping expands text", async () => {
  const response = { rows: [JSON.stringify("\u0001".repeat(50000))], returnedRows: 1n, truncated: false, limitReason: null };
  await assert.rejects(
    adapter.executeXQuery(
      {
        async eval() {
          return response;
        },
      },
      "bounded",
    ),
    /JSON-compatible output exceeds/,
  );
});
