// Object destructuring
const input = { a: 1, b: 2, c: 3 };
const { a, b } = input;

botest.assertValueEquals(a, 1, "a should be 1");
botest.assertValueEquals(b, 2, "b should be 2");


botest.assertOk();

export {};
