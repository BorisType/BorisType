// Spread operator with arrays
const arr1 = [1, 2, 3];
const arr2 = [4, 5, 6];

const test1 = [10, 11, 12, ...arr1, ...arr2];
const test2 = [10, ...arr1, 11, ...arr2, 12];
const test3 = [...arr2];

botest.assertJsArrayEquals(test1, [10, 11, 12, 1, 2, 3, 4, 5, 6], "Arrays should be combined");
botest.assertJsArrayEquals(test2, [10, 1, 2, 3, 11, 4, 5, 6, 12], "Arrays should be combined");
botest.assertJsArrayEquals(test3, [4, 5, 6], "Arrays should be combined");

botest.assertOk();

export {};
