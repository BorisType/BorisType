// Object destructuring with rest operator
const input = { a: 1, b: 2, c: 3 };
const { a, b, ...rest } = input;

botest.assertValueEquals(a, 1, "a should be 1");
botest.assertValueEquals(b, 2, "b should be 2");
botest.assertValueEquals(rest.c, 3, "rest.c should be 3");


botest.assertOk();

export {};
