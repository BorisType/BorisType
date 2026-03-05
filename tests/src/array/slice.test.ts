// Basic usage - no parameters (full copy)
const arr1 = [1, 2, 3, 4, 5];
const result1 = arr1.slice();
botest.assertJsArrayEquals(result1, [1, 2, 3, 4, 5], "arr1.slice() should return full copy [1, 2, 3, 4, 5]");
botest.assertJsArrayEquals(arr1, [1, 2, 3, 4, 5], "arr1 original should be unchanged"); // Original unchanged

// With start index
const result2 = arr1.slice(2);
botest.assertJsArrayEquals(result2, [3, 4, 5], "arr1.slice(2) should return [3, 4, 5]");

// With start and end index
const result3 = arr1.slice(1, 4);
botest.assertJsArrayEquals(result3, [2, 3, 4], "arr1.slice(1, 4) should return [2, 3, 4]");

// Negative start index
const result4 = arr1.slice(-3);
botest.assertJsArrayEquals(result4, [3, 4, 5], "arr1.slice(-3) should return [3, 4, 5]");

// Negative end index
const result5 = arr1.slice(1, -1);
botest.assertJsArrayEquals(result5, [2, 3, 4], "arr1.slice(1, -1) should return [2, 3, 4]");

// Both negative indices
const result6 = arr1.slice(-4, -1);
botest.assertJsArrayEquals(result6, [2, 3, 4], "arr1.slice(-4, -1) should return [2, 3, 4]");

// Start index out of bounds (positive)
const result7 = arr1.slice(10);
botest.assertJsArrayEquals(result7, [], "arr1.slice(10) out of bounds should return empty array");

// Start index out of bounds (negative)
const result8 = arr1.slice(-10);
botest.assertJsArrayEquals(result8, [1, 2, 3, 4, 5], "arr1.slice(-10) large negative should return full array");

// End index out of bounds
const result9 = arr1.slice(2, 10);
botest.assertJsArrayEquals(result9, [3, 4, 5], "arr1.slice(2, 10) end out of bounds should return [3, 4, 5]");

// Start > end (empty result)
const result10 = arr1.slice(3, 2);
botest.assertJsArrayEquals(result10, [], "arr1.slice(3, 2) start > end should return empty array");

// Empty array
const emptyArr: any[] = [];
const result11 = emptyArr.slice();
botest.assertJsArrayEquals(result11, [], "emptyArr.slice() should return empty array");

// Array with one element
const singleArr = [42];
const result12 = singleArr.slice();
botest.assertJsArrayEquals(result12, [42], "singleArr.slice() should return [42]");
const result13 = singleArr.slice(0, 1);
botest.assertJsArrayEquals(result13, [42], "singleArr.slice(0, 1) should return [42]");

// Array with undefined and null
const arr2 = [undefined, null, 0, false];
const result14 = arr2.slice(1, 3);
botest.assertJsArrayEquals(result14, [null, 0], "arr2.slice(1, 3) should return [null, 0]");

// Array with objects (shallow copy)
const obj1 = { x: 1 };
const obj2 = { y: 2 };
const arr3 = [obj1, obj2];
const result15 = arr3.slice();
botest.assertJsArrayEquals(result15, [obj1, obj2], "arr3.slice() should return [obj1, obj2]");
botest.assertValueEquals(result15[0] === obj1, true, "result15[0] should be same reference as obj1"); // Same reference

// Array with nested arrays (shallow copy)
const arr4 = [[1], [2, 3], []];
const result16 = arr4.slice(1);
botest.assertJsArrayEquals(result16, [[2, 3], []], "arr4.slice(1) should return [[2, 3], []]");
botest.assertValueEquals(result16[0] === arr4[1], true, "result16[0] should be same reference as arr4[1]"); // Same reference

// Array with mixed types
const arr5 = [1, "a", null, undefined, true];
const result17 = arr5.slice(2, 5);
botest.assertJsArrayEquals(result17, [null, undefined, true], "arr5.slice(2, 5) should return [null, undefined, true]");

// Array with strings
const arr6 = ["a", "b", "c", "d"];
const result18 = arr6.slice(1, 3);
botest.assertJsArrayEquals(result18, ["b", "c"], "arr6.slice(1, 3) should return ['b', 'c']");

// Return value is new array
const arr7 = [1, 2, 3];
const result19 = arr7.slice();
botest.assertValueEquals(result19 === arr7, false, "result19 should be different array reference"); // Different arrays
botest.assertJsArrayEquals(result19, arr7, "result19 should have same content as arr7"); // Same content


botest.assertOk();

export { };