// Basic usage
const arr1 = [1, 2, 3, 4, 5];
arr1.copyWithin(0, 3);
botest.assertJsArrayEquals(arr1, [4, 5, 3, 4, 5], "copyWithin(0, 3) should copy from index 3 to start");

// With start and end
const arr2 = [1, 2, 3, 4, 5];
arr2.copyWithin(1, 3, 4);
botest.assertJsArrayEquals(arr2, [1, 4, 3, 4, 5], "copyWithin(1, 3, 4) should copy single element to index 1");

// With negative target
const arr3 = [1, 2, 3, 4, 5];
arr3.copyWithin(-2, 0, 2);
botest.assertJsArrayEquals(arr3, [1, 2, 3, 1, 2], "copyWithin(-2, 0, 2) should copy to last two positions");

// With negative start
const arr4 = [1, 2, 3, 4, 5];
arr4.copyWithin(0, -2);
botest.assertJsArrayEquals(arr4, [4, 5, 3, 4, 5], "copyWithin(0, -2) should copy from last two elements");

// With out of bounds
const arr5 = [1, 2, 3];
arr5.copyWithin(5, 1);
botest.assertJsArrayEquals(arr5, [1, 2, 3], "copyWithin with out of bounds target should not change array");

// On empty array
const arr6: any[] = [];
arr6.copyWithin(0, 1);
botest.assertJsArrayEquals(arr6, [], "copyWithin on empty array should stay empty");

// With undefined/null elements
const arr7 = [undefined, null, 1, 2];
arr7.copyWithin(1, 0, 2);
botest.assertJsArrayEquals(arr7, [undefined, undefined, null, 2], "copyWithin should preserve undefined/null");

// With nested arrays
const arr8 = [[1], [2], [3], [4]];
arr8.copyWithin(2, 0, 2);
botest.assertJsArrayEquals(arr8, [[1], [2], [1], [2]], "copyWithin should work with nested arrays");

botest.assertOk();

export {};
