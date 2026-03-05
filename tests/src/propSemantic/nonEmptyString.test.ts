// Optional chaining with property that is non-empty string
const obj = { a: { b: "aaa" } };

const value = obj.a?.b.length;

botest.assertValueEquals(value, 3, "string length should be 3");


botest.assertOk();

export {};
