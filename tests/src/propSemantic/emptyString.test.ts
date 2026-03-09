// Optional chaining with property that is empty string
const obj = { a: { b: "" } };

const value = obj.a?.b;

botest.assertValueEquals(value, "", "optional chaining should return empty string");

botest.assertOk();

export {};
