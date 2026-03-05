// Optional chaining with null value
const obj = { a: null };

// @ts-ignore
const value = obj.a?.b;

botest.assertValueEquals(value, undefined, "chaining on null should return undefined");


botest.assertOk();

export {};
