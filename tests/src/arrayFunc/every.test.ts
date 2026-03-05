const arr = [1, 2, 3];
const result1 = arr.every((x) => x > 1);
const result2 = arr.every((x) => x > 0);

botest.assertValueEquals(result1, false, undefined);
botest.assertValueEquals(result2, true, undefined);


botest.assertOk();

export { };