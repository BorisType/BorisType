// Basic usage
const arr1 = [1, 2, 3, 4, 2];
botest.assertValueEquals(arr1.lastIndexOf(2), 4, "lastIndexOf(2) should return last occurrence at index 4");
botest.assertValueEquals(arr1.lastIndexOf(3), 2, "lastIndexOf(3) should return index 2");
botest.assertValueEquals(arr1.lastIndexOf(5), -1, "lastIndexOf(5) not found should return -1");

// From index
botest.assertValueEquals(arr1.lastIndexOf(2, 3), 1, "lastIndexOf(2, 3) should find first occurrence");
botest.assertValueEquals(arr1.lastIndexOf(2, 0), -1, "lastIndexOf(2, 0) should return -1");
botest.assertValueEquals(arr1.lastIndexOf(4, 2), -1, "lastIndexOf(4, 2) before element should return -1");

// Negative from index
botest.assertValueEquals(arr1.lastIndexOf(2, -1), 4, "lastIndexOf(2, -1) should find last occurrence");
botest.assertValueEquals(arr1.lastIndexOf(2, -2), 1, "lastIndexOf(2, -2) should find first occurrence");
botest.assertValueEquals(arr1.lastIndexOf(2, -3), 1, "lastIndexOf(2, -3) should find first occurrence");
botest.assertValueEquals(arr1.lastIndexOf(1, -100), -1, "lastIndexOf(1, -100) large negative should return -1");

// Array with strings
const arr2 = ["a", "b", "c", "a", "b"];
botest.assertValueEquals(arr2.lastIndexOf("a"), 3, "lastIndexOf('a') should return last occurrence at 3");
botest.assertValueEquals(arr2.lastIndexOf("b"), 4, "lastIndexOf('b') should return last occurrence at 4");
botest.assertValueEquals(arr2.lastIndexOf("a", 2), 0, "lastIndexOf('a', 2) should return first occurrence");
botest.assertValueEquals(arr2.lastIndexOf("d"), -1, "lastIndexOf('d') not found should return -1");

// Array with undefined and null
const arr3 = [undefined, null, 0, false, undefined];
botest.assertValueEquals(arr3.lastIndexOf(undefined), 4, "lastIndexOf(undefined) should return last at index 4");
botest.assertValueEquals(arr3.lastIndexOf(null), 1, "lastIndexOf(null) should return index 1");
botest.assertValueEquals(arr3.lastIndexOf(0), 2, "lastIndexOf(0) should return index 2");
botest.assertValueEquals(arr3.lastIndexOf(false), 3, "lastIndexOf(false) should return index 3");
botest.assertValueEquals(arr3.lastIndexOf(true), -1, "lastIndexOf(true) not found should return -1");

// Array with objects
const obj = { x: 1 };
const arr5 = [obj, { x: 1 }, obj];
botest.assertValueEquals(arr5.lastIndexOf(obj), 2, "lastIndexOf(obj) should find same ref at index 2");
botest.assertValueEquals(arr5.lastIndexOf({ x: 1 }), -1, "lastIndexOf different object ref should return -1");

// Array with arrays
const subArr = [1, 2];
const arr6 = [subArr, [1, 2], subArr];
botest.assertValueEquals(arr6.lastIndexOf(subArr), 2, "lastIndexOf(subArr) should find same ref at index 2");
botest.assertValueEquals(arr6.lastIndexOf([1, 2]), -1, "lastIndexOf different array ref should return -1");

// Empty array
const emptyArr: any[] = [];
botest.assertValueEquals(emptyArr.lastIndexOf(1), -1, "lastIndexOf on empty array should return -1");

// Array with one element
const singleArr = [42];
botest.assertValueEquals(singleArr.lastIndexOf(42), 0, "lastIndexOf(42) on single element should return 0");
botest.assertValueEquals(singleArr.lastIndexOf(43), -1, "lastIndexOf(43) not found should return -1");

// Array with mixed types
const mixedArr = [1, "1", true, null, undefined, 1];
botest.assertValueEquals(mixedArr.lastIndexOf("1"), 1, "lastIndexOf('1') should return index 1");
botest.assertValueEquals(mixedArr.lastIndexOf(1), 5, "lastIndexOf(1) should return last occurrence at 5");
botest.assertValueEquals(mixedArr.lastIndexOf(true), 2, "lastIndexOf(true) should return index 2");
botest.assertValueEquals(mixedArr.lastIndexOf(null), 3, "lastIndexOf(null) should return index 3");
botest.assertValueEquals(mixedArr.lastIndexOf(undefined), 4, "lastIndexOf(undefined) should return index 4");

// Array with nested arrays
const nestedArr = [[1], [2], [1]];
botest.assertValueEquals(nestedArr.lastIndexOf([1]), -1, "nestedArr.lastIndexOf([1]) different ref should return -1");
botest.assertValueEquals(nestedArr.lastIndexOf(nestedArr[0]), 0, "nestedArr.lastIndexOf(nestedArr[0]) should return index 0");
botest.assertValueEquals(nestedArr.lastIndexOf(nestedArr[2]), 2, "nestedArr.lastIndexOf(nestedArr[2]) should return index 2");

// From index larger than array length
botest.assertValueEquals(arr1.lastIndexOf(2, 10), 4, "lastIndexOf(2, 10) fromIndex > length should return last occurrence at 4");
botest.assertValueEquals(arr1.lastIndexOf(2, 100), 4, "lastIndexOf(2, 100) large fromIndex should return last occurrence at 4");


botest.assertOk();

export { };