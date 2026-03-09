const arr = [1, 2, 3];
const result1 = arr.reduce((acc, x) => acc + x, 0);
botest.assertValueEquals(result1, 6, undefined);

botest.assertOk();

export {};
