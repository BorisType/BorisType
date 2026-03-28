const arr = [10, 20, 30, 40, 50];

botest.assertValueEquals(arr.toReversed().at(-2), 20, "arr.toReversed().at(-2) should equal 20");

const arr2 = [1, 2, 3];
const arr3 = arr2.concat([4, 5, 6], [7, 8, 9]).slice(2, 7);
botest.assertJsArrayEquals(arr3, [3, 4, 5, 6, 7], "arr2.concat().slice(2,7) should equal [3,4,5,6,7]");

botest.assertOk();

export {};
