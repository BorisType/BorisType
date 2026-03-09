const arr = [1, 2, 3];
const result = arr.filter((x) => x > 1);
botest.assertJsArrayEquals(result, [2, 3], undefined);

botest.assertOk();

export {};
