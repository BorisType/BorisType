const arr = [1, 2, 3];
const result1 = arr.findLast((x) => x > 1);
const result2 = arr.findLast((x) => x === 4);
botest.assertValueEquals(result1, 3, undefined);
botest.assertValueEquals(result2, undefined, undefined);

botest.assertOk();

export {};
