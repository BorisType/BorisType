// Basic usage
const arr1 = [1, 2, 3, 4];
arr1.fill(9);
botest.assertJsArrayEquals(arr1, [9, 9, 9, 9], "fill(9) should fill entire array");

// With start and end
const arr2 = [1, 2, 3, 4, 5];
arr2.fill(7, 1, 4);
botest.assertJsArrayEquals(arr2, [1, 7, 7, 7, 5], "fill(7, 1, 4) should fill indexes 1-3");

// With negative start
const arr3 = [1, 2, 3, 4];
arr3.fill(5, -2);
botest.assertJsArrayEquals(arr3, [1, 2, 5, 5], "fill(5, -2) should fill last two elements");

// With negative end
const arr4 = [1, 2, 3, 4];
arr4.fill(0, 1, -1);
botest.assertJsArrayEquals(arr4, [1, 0, 0, 4], "fill(0, 1, -1) should fill middle elements");

// With out of bounds
const arr5 = [1, 2, 3];
arr5.fill(8, 10, 20);
botest.assertJsArrayEquals(arr5, [1, 2, 3], "fill with out of bounds should not change array");

// On empty array
const arr6: any[] = [];
arr6.fill(1);
botest.assertJsArrayEquals(arr6, [], "fill on empty array should stay empty");

// With undefined/null
const arr7 = [1, 2, 3];
// @ts-ignore
arr7.fill(undefined, 1, 2);
botest.assertJsArrayEquals(arr7, [1, undefined, 3], "fill with undefined should work");
// @ts-ignore
arr7.fill(null, 0, 1);
botest.assertJsArrayEquals(arr7, [null, undefined, 3], "fill with null should work");

// With nested arrays
const arr8 = [[1], [2], [3]];
arr8.fill([9, 9], 1);
botest.assertJsArrayEquals(arr8, [[1], [9, 9], [9, 9]], "fill with nested array should work");

// With strings
const arr9 = [1, 2, 3];
// @ts-ignore
arr9.fill("x", 0, 2);
botest.assertJsArrayEquals(arr9, ["x", "x", 3], "fill with string should work");

botest.assertOk();

export {};
