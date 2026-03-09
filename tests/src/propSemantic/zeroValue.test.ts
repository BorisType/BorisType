// Optional chaining with property that is 0
const obj = { a: { b: 0 } };

const value = obj.a?.b;

botest.assertValueEquals(value, 0, "optional chaining should return 0");

botest.assertOk();

export {};
