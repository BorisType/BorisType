// Basic usage
const arr1 = [1, 2, 3, 4, 5];
botest.assertValueEquals(arr1.shift(), 1, "arr1.shift() should return 1");
botest.assertJsArrayEquals(arr1, [2, 3, 4, 5], "arr1 after first shift should be [2, 3, 4, 5]");
botest.assertValueEquals(arr1.shift(), 2, "arr1.shift() should return 2");
botest.assertJsArrayEquals(arr1, [3, 4, 5], "arr1 after second shift should be [3, 4, 5]");
botest.assertValueEquals(arr1.shift(), 3, "arr1.shift() should return 3");
botest.assertJsArrayEquals(arr1, [4, 5], "arr1 after third shift should be [4, 5]");

// Empty array
const emptyArr: any[] = [];
botest.assertValueEquals(emptyArr.shift(), undefined, "emptyArr.shift() should return undefined");
botest.assertJsArrayEquals(emptyArr, [], "emptyArr should remain empty");

// Array with one element
const singleArr = [42];
botest.assertValueEquals(singleArr.shift(), 42, "singleArr.shift() should return 42");
botest.assertJsArrayEquals(singleArr, [], "singleArr after shift should be empty");
botest.assertValueEquals(
  singleArr.shift(),
  undefined,
  "singleArr.shift() on empty should return undefined",
);
botest.assertJsArrayEquals(singleArr, [], "singleArr should remain empty");

// Array with undefined and null
const arr2 = [undefined, null, 0, false];
botest.assertValueEquals(arr2.shift(), undefined, "arr2.shift() should return undefined");
botest.assertJsArrayEquals(
  arr2,
  [null, 0, false],
  "arr2 after first shift should be [null, 0, false]",
);
botest.assertValueEquals(arr2.shift(), null, "arr2.shift() should return null");
botest.assertJsArrayEquals(arr2, [0, false], "arr2 after second shift should be [0, false]");
botest.assertValueEquals(arr2.shift(), 0, "arr2.shift() should return 0");
botest.assertJsArrayEquals(arr2, [false], "arr2 after third shift should be [false]");

// Array with objects
const obj1 = { x: 1 };
const obj2 = { y: 2 };
const arr3 = [obj1, obj2];
botest.assertValueEquals(arr3.shift(), obj1, "arr3.shift() should return obj1");
botest.assertJsArrayEquals(arr3, [obj2], "arr3 after first shift should be [obj2]");
botest.assertValueEquals(arr3.shift(), obj2, "arr3.shift() should return obj2");
botest.assertJsArrayEquals(arr3, [], "arr3 after second shift should be empty");

// // Array with nested arrays
// const arr4 = [[1], [2, 3], []];
// botest.assertJsArrayEquals(arr4.shift() ?? [], [1]);
// botest.assertJsArrayEquals(arr4, [[2, 3], []]);
// botest.assertJsArrayEquals(arr4.shift() ?? [], [2, 3]);
// botest.assertJsArrayEquals(arr4, [[]]);
// botest.assertJsArrayEquals(arr4.shift() ?? [], []);
// botest.assertJsArrayEquals(arr4, []);

// Array with mixed types
const arr5 = [1, "a", null, undefined, true];
botest.assertValueEquals(arr5.shift(), 1, "arr5.shift() should return 1");
botest.assertJsArrayEquals(
  arr5,
  ["a", null, undefined, true],
  "arr5 after first shift should be ['a', null, undefined, true]",
);
botest.assertValueEquals(arr5.shift(), "a", "arr5.shift() should return 'a'");
botest.assertJsArrayEquals(
  arr5,
  [null, undefined, true],
  "arr5 after second shift should be [null, undefined, true]",
);
botest.assertValueEquals(arr5.shift(), null, "arr5.shift() should return null");
botest.assertJsArrayEquals(
  arr5,
  [undefined, true],
  "arr5 after third shift should be [undefined, true]",
);

// Array with strings
const arr6 = ["a", "b", "c"];
botest.assertValueEquals(arr6.shift(), "a", "arr6.shift() should return 'a'");
botest.assertJsArrayEquals(arr6, ["b", "c"], "arr6 after first shift should be ['b', 'c']");
botest.assertValueEquals(arr6.shift(), "b", "arr6.shift() should return 'b'");
botest.assertJsArrayEquals(arr6, ["c"], "arr6 after second shift should be ['c']");

// Return value is the removed element
const arr7 = [1, 2, 3];
const removed = arr7.shift();
botest.assertValueEquals(removed, 1, "removed should be 1");
botest.assertJsArrayEquals(arr7, [2, 3], "arr7 after shift should be [2, 3]");

botest.assertOk();

export {};
