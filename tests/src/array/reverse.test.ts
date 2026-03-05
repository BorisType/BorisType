// Basic usage
const arr1 = [1, 2, 3, 4, 5];
arr1.reverse();
botest.assertJsArrayEquals(arr1, [5, 4, 3, 2, 1], "arr1.reverse() should reverse to [5, 4, 3, 2, 1]");

// Array with even length
const arr2 = [1, 2, 3, 4];
arr2.reverse();
botest.assertJsArrayEquals(arr2, [4, 3, 2, 1], "arr2.reverse() even length should be [4, 3, 2, 1]");

// Array with odd length
const arr3 = [1, 2, 3];
arr3.reverse();
botest.assertJsArrayEquals(arr3, [3, 2, 1], "arr3.reverse() odd length should be [3, 2, 1]");

// Empty array
const emptyArr: any[] = [];
emptyArr.reverse();
botest.assertJsArrayEquals(emptyArr, [], "emptyArr.reverse() should remain empty");

// Array with one element
const singleArr = [42];
singleArr.reverse();
botest.assertJsArrayEquals(singleArr, [42], "singleArr.reverse() should remain [42]");

// Array with two elements
const arr4 = [1, 2];
arr4.reverse();
botest.assertJsArrayEquals(arr4, [2, 1], "arr4.reverse() two elements should be [2, 1]");

// Array with undefined and null
const arr5 = [undefined, null, 0, false];
arr5.reverse();
botest.assertJsArrayEquals(arr5, [false, 0, null, undefined], "arr5.reverse() with undefined/null should be [false, 0, null, undefined]");

// Array with objects
const obj1 = { x: 1 };
const obj2 = { y: 2 };
const arr6 = [obj1, obj2];
arr6.reverse();
botest.assertJsArrayEquals(arr6, [obj2, obj1], "arr6.reverse() objects should be [obj2, obj1]");

// Array with nested arrays
const arr7 = [[1], [2, 3], []];
arr7.reverse();
botest.assertJsArrayEquals(arr7, [[], [2, 3], [1]], "arr7.reverse() nested arrays should be [[], [2, 3], [1]]");

// Array with mixed types
const arr8 = [1, "a", null, undefined, true];
arr8.reverse();
botest.assertJsArrayEquals(arr8, [true, undefined, null, "a", 1], "arr8.reverse() mixed types should be [true, undefined, null, 'a', 1]");

// Array with strings
const arr9 = ["a", "b", "c", "d"];
arr9.reverse();
botest.assertJsArrayEquals(arr9, ["d", "c", "b", "a"], "arr9.reverse() strings should be ['d', 'c', 'b', 'a']");

// Reverse twice returns to original
const arr10 = [1, 2, 3, 4];
const original = [1, 2, 3, 4];
arr10.reverse();
arr10.reverse();
botest.assertJsArrayEquals(arr10, original, "arr10.reverse() twice should return to original");

// Return value is the same array
const arr11 = [1, 2, 3];
const result = arr11.reverse();
botest.assertValueEquals(result === arr11, true, "arr11.reverse() should return the same array reference");
botest.assertJsArrayEquals(result, [3, 2, 1], "result should be [3, 2, 1]");


botest.assertOk();

export { };