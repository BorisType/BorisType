// Array destructuring with rest operator
const input = [10, 20, 30];
const [first, second, ...rest] = input;

botest.assertValueEquals(first, 10, "first should be 10");
botest.assertValueEquals(second, 20, "second should be 20");
botest.assertValueEquals(rest[0], 30, "rest[0] should be 30");


botest.assertOk();

export {};
