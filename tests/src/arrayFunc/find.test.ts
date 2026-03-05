const arr = [1, 2, 3];
const result1 = arr.find((x) => x > 1);
const result2 = arr.find((x) => x === 4);
botest.assertValueEquals(result1, 2, undefined);
botest.assertValueEquals(result2, undefined, undefined);


botest.assertOk();

export { };