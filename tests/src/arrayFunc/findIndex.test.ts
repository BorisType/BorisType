const arr = [1, 2, 3];
const result1 = arr.findIndex((x) => x > 1);
const result2 = arr.findIndex((x) => x === 4);
botest.assertValueEquals(result1, 1, undefined);
botest.assertValueEquals(result2, -1, undefined);

botest.assertOk();

export {};
