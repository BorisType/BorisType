// Array destructuring
const input = [10, 20, 30];
const [first, second] = input;

botest.assertValueEquals(first, 10, "first should be 10");
botest.assertValueEquals(second, 20, "second should be 20");


botest.assertOk();

export {};
