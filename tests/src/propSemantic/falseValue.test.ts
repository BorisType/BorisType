// Optional chaining with property that is false
const obj = { a: { b: false } };

const value = obj.a?.b;

botest.assertValueEquals(value, false, "optional chaining should return false");

botest.assertOk();

export {};
