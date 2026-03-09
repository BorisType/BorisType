const arr = [1, 2, 3];
const result1 = arr.findLastIndex((x) => x > 1);
const result2 = arr.findLastIndex((x) => x === 4);
botest.assertValueEquals(result1, 2, undefined);
botest.assertValueEquals(result2, -1, undefined);

botest.assertOk();

export {};
