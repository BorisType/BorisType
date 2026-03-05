const arr = [1, 2, 3];
const result = arr.map((x) => x + 1);
botest.assertJsArrayEquals(result, [2, 3, 4], undefined);


botest.assertOk();

export { };