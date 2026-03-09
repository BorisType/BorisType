const arr = [1, 2, 3];
const result1 = arr.some((x) => x > 1);
const result2 = arr.some((x) => x === 4);
botest.assertValueEquals(result1, true, undefined);
botest.assertValueEquals(result2, false, undefined);

botest.assertOk();

export {};
