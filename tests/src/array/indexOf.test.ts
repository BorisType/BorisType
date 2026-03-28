// Basic usage
const arr1 = [1, 2, 3, 4, 2];
botest.assertValueEquals(arr1.indexOf(2), 1, "indexOf(2) should return first occurrence at index 1");
botest.assertValueEquals(arr1.indexOf(3), 2, "indexOf(3) should return index 2");
botest.assertValueEquals(arr1.indexOf(5), -1, "indexOf(5) not found should return -1");

// Start index
botest.assertValueEquals(arr1.indexOf(2, 2), 4, "indexOf(2, 2) should find second occurrence at index 4");
botest.assertValueEquals(arr1.indexOf(2, 5), -1, "indexOf(2, 5) start beyond array should return -1");

// Negative start index
botest.assertValueEquals(arr1.indexOf(2, -1), 4, "indexOf(2, -1) should start from last index");
botest.assertValueEquals(arr1.indexOf(2, -3), 4, "indexOf(2, -3) should find occurrence at index 4");
botest.assertValueEquals(arr1.indexOf(1, -100), 0, "indexOf(1, -100) large negative should search from start");

// Array with strings
const arr2 = ["a", "b", "c", "a"];
botest.assertValueEquals(arr2.indexOf("a"), 0, "indexOf('a') should return first occurrence");
botest.assertValueEquals(arr2.indexOf("a", 1), 3, "indexOf('a', 1) should skip first and return index 3");
botest.assertValueEquals(arr2.indexOf("d"), -1, "indexOf('d') not found should return -1");

// Array with undefined and null
const arr3 = [undefined, null, 0, false];
botest.assertValueEquals(arr3.indexOf(undefined), 0, "indexOf(undefined) should return index 0");
botest.assertValueEquals(arr3.indexOf(null), 1, "indexOf(null) should return index 1");
botest.assertValueEquals(arr3.indexOf(0), 2, "indexOf(0) should return index 2");
botest.assertValueEquals(arr3.indexOf(false), 3, "indexOf(false) should return index 3");
botest.assertValueEquals(arr3.indexOf(true), -1, "indexOf(true) not found should return -1");

// Array with objects
const obj = { x: 1 };
const arr5 = [obj, { x: 1 }];
botest.assertValueEquals(arr5.indexOf(obj), 0, "indexOf(obj) should find same reference at index 0");
botest.assertValueEquals(arr5.indexOf({ x: 1 }), -1, "indexOf with different object ref should return -1");

// Array with arrays
const subArr = [1, 2];
const arr6 = [subArr, [1, 2]];
botest.assertValueEquals(arr6.indexOf(subArr), 0, "indexOf(subArr) should find same reference at index 0");
botest.assertValueEquals(arr6.indexOf([1, 2]), -1, "indexOf with different array ref should return -1");

// Empty array
const emptyArr: any[] = [];
botest.assertValueEquals(emptyArr.indexOf(1), -1, "indexOf on empty array should return -1");

// Array with mixed types
const mixedArr = [1, "1", true, null, undefined];
botest.assertValueEquals(mixedArr.indexOf("1"), 1, "indexOf('1') should return index 1");
botest.assertValueEquals(mixedArr.indexOf(1), 0, "indexOf(1) should return index 0");
botest.assertValueEquals(mixedArr.indexOf(true), 2, "indexOf(true) should return index 2");
botest.assertValueEquals(mixedArr.indexOf(null), 3, "indexOf(null) should return index 3");
botest.assertValueEquals(mixedArr.indexOf(undefined), 4, "indexOf(undefined) should return index 4");

// Array with nested arrays
const nestedArr = [[1], [2], [3]];
botest.assertValueEquals(nestedArr.indexOf([2]), -1, "indexOf([2]) different ref should return -1");
botest.assertValueEquals(nestedArr.indexOf(nestedArr[1]), 1, "indexOf(nestedArr[1]) same ref should return 1");

botest.assertOk();

export {};
