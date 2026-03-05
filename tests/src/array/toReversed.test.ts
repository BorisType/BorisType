// Basic usage
const arr1 = [1, 2, 3, 4, 5];
const result1 = arr1.toReversed();
botest.assertJsArrayEquals(result1, [5, 4, 3, 2, 1], "arr1.toReversed() should return [5, 4, 3, 2, 1]");
botest.assertJsArrayEquals(arr1, [1, 2, 3, 4, 5], "arr1 original should be unchanged"); // Original unchanged

// Array with even length
const arr2 = [1, 2, 3, 4];
const result2 = arr2.toReversed();
botest.assertJsArrayEquals(result2, [4, 3, 2, 1], "arr2.toReversed() even length should return [4, 3, 2, 1]");
botest.assertJsArrayEquals(arr2, [1, 2, 3, 4], "arr2 original should be unchanged"); // Original unchanged

// Array with odd length
const arr3 = [1, 2, 3];
const result3 = arr3.toReversed();
botest.assertJsArrayEquals(result3, [3, 2, 1], "arr3.toReversed() odd length should return [3, 2, 1]");
botest.assertJsArrayEquals(arr3, [1, 2, 3], "arr3 original should be unchanged"); // Original unchanged

// Empty array
const emptyArr: any[] = [];
const result4 = emptyArr.toReversed();
botest.assertJsArrayEquals(result4, [], "emptyArr.toReversed() should return empty array");
botest.assertJsArrayEquals(emptyArr, [], "emptyArr original should be unchanged"); // Original unchanged

// Array with one element
const singleArr = [42];
const result5 = singleArr.toReversed();
botest.assertJsArrayEquals(result5, [42], "singleArr.toReversed() should return [42]");
botest.assertJsArrayEquals(singleArr, [42], "singleArr original should be unchanged"); // Original unchanged

// Array with two elements
const arr4 = [1, 2];
const result6 = arr4.toReversed();
botest.assertJsArrayEquals(result6, [2, 1], "arr4.toReversed() two elements should return [2, 1]");
botest.assertJsArrayEquals(arr4, [1, 2], "arr4 original should be unchanged"); // Original unchanged

// Array with undefined and null
const arr5 = [undefined, null, 0, false];
const result7 = arr5.toReversed();
botest.assertJsArrayEquals(result7, [false, 0, null, undefined], "arr5.toReversed() should return [false, 0, null, undefined]");
botest.assertJsArrayEquals(arr5, [undefined, null, 0, false], "arr5 original should be unchanged"); // Original unchanged

// Array with objects (shallow copy)
const obj1 = { x: 1 };
const obj2 = { y: 2 };
const arr6 = [obj1, obj2];
const result8 = arr6.toReversed();
botest.assertJsArrayEquals(result8, [obj2, obj1], "arr6.toReversed() should return [obj2, obj1]");
botest.assertValueEquals(result8[0] === obj2, true, "result8[0] should be same reference as obj2"); // Same reference
botest.assertJsArrayEquals(arr6, [obj1, obj2], "arr6 original should be unchanged"); // Original unchanged

// Array with nested arrays (shallow copy)
const arr7 = [[1], [2, 3], []];
const result9 = arr7.toReversed();
botest.assertJsArrayEquals(result9, [[], [2, 3], [1]], "arr7.toReversed() should return [[], [2, 3], [1]]");
botest.assertValueEquals(result9[1] === arr7[1], true, "result9[1] should be same reference as arr7[1]"); // Same reference
botest.assertJsArrayEquals(arr7, [[1], [2, 3], []], "arr7 original should be unchanged"); // Original unchanged

// Array with mixed types
const arr8 = [1, "a", null, undefined, true];
const result10 = arr8.toReversed();
botest.assertJsArrayEquals(result10, [true, undefined, null, "a", 1], "arr8.toReversed() should return [true, undefined, null, 'a', 1]");
botest.assertJsArrayEquals(arr8, [1, "a", null, undefined, true], "arr8 original should be unchanged"); // Original unchanged

// Array with strings
const arr9 = ["a", "b", "c", "d"];
const result11 = arr9.toReversed();
botest.assertJsArrayEquals(result11, ["d", "c", "b", "a"], "arr9.toReversed() should return ['d', 'c', 'b', 'a']");
botest.assertJsArrayEquals(arr9, ["a", "b", "c", "d"], "arr9 original should be unchanged"); // Original unchanged

// Return value is new array
const arr10 = [1, 2, 3];
const result12 = arr10.toReversed();
botest.assertValueEquals(result12 === arr10, false, "result12 should be different array reference"); // Different arrays
botest.assertJsArrayEquals(result12, [3, 2, 1], "result12 should be [3, 2, 1]");
botest.assertJsArrayEquals(arr10, [1, 2, 3], "arr10 original should be unchanged"); // Original unchanged

// Multiple calls return same result
const arr11 = [1, 2, 3, 4];
const result13 = arr11.toReversed();
const result14 = arr11.toReversed();
botest.assertJsArrayEquals(result13, result14, "multiple toReversed() calls should return same result");
botest.assertJsArrayEquals(result13, [4, 3, 2, 1], "result13 should be [4, 3, 2, 1]");
botest.assertJsArrayEquals(arr11, [1, 2, 3, 4], "arr11 original should be unchanged"); // Original unchanged


botest.assertOk();

export { };