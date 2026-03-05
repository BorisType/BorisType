const arr = [1, 2, 3];
const result1 = arr.flatMap((x) => [x, x * 2]);
const result2 = arr.flatMap((x) => (x === 2 ? [x, x * 2] : []));
botest.assertJsArrayEquals(result1, [1, 2, 2, 4, 3, 6], undefined);
botest.assertJsArrayEquals(result2, [2, 4], undefined);


botest.assertOk();

export { };