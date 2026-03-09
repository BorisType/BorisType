// Optional chaining combined with || fallback

const testObject: any = {
  a: null,
};

// null optional chain || fallback
const result1 = testObject.a?.b?.c || "default value";
botest.assertValueEquals(result1, "default value", "null chain || fallback returns fallback");

// truthy optional chain || fallback
const testObject2: any = {
  a: { b: { c: "found" } },
};
const result2 = testObject2.a?.b?.c || "default value";
botest.assertValueEquals(result2, "found", "truthy chain || fallback returns chain value");

// || with function call short-circuit
let called = false;
function sideEffect(): string {
  called = true;
  return "side";
}

const truthy: any = "exists";
called = false;
const result3 = truthy || sideEffect();
botest.assertValueEquals(result3, "exists", "truthy || fn() returns left");
botest.assertValueEquals(called, false, "fn() not called when left truthy");

botest.assertOk();

export {};
