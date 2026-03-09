// Basic usage
const arr1 = [1, 2, 3];
botest.assertValueEquals(arr1.pop(), 3, "arr1.pop() should return 3");
botest.assertJsArrayEquals(arr1, [1, 2], "arr1 after first pop should be [1, 2]");
botest.assertValueEquals(arr1.pop(), 2, "arr1.pop() should return 2");
botest.assertJsArrayEquals(arr1, [1], "arr1 after second pop should be [1]");
botest.assertValueEquals(arr1.pop(), 1, "arr1.pop() should return 1");
botest.assertJsArrayEquals(arr1, [], "arr1 after third pop should be empty");
botest.assertValueEquals(
  arr1.pop(),
  undefined,
  "arr1.pop() on empty array should return undefined",
);
botest.assertJsArrayEquals(arr1, [], "arr1 should remain empty");

// Empty array
const emptyArr: any[] = [];
botest.assertValueEquals(emptyArr.pop(), undefined, "emptyArr.pop() should return undefined");
botest.assertJsArrayEquals(emptyArr, [], "emptyArr should remain empty");

// Array with one element
const singleArr = [42];
botest.assertValueEquals(singleArr.pop(), 42, "singleArr.pop() should return 42");
botest.assertJsArrayEquals(singleArr, [], "singleArr after pop should be empty");
botest.assertValueEquals(
  singleArr.pop(),
  undefined,
  "singleArr.pop() on empty should return undefined",
);

// Array with undefined and null
const arr2 = [undefined, null, 0];
botest.assertValueEquals(arr2.pop(), 0, "arr2.pop() should return 0");
botest.assertJsArrayEquals(
  arr2,
  [undefined, null],
  "arr2 after first pop should be [undefined, null]",
);
botest.assertValueEquals(arr2.pop(), null, "arr2.pop() should return null");
botest.assertJsArrayEquals(arr2, [undefined], "arr2 after second pop should be [undefined]");
botest.assertValueEquals(arr2.pop(), undefined, "arr2.pop() should return undefined");
botest.assertJsArrayEquals(arr2, [], "arr2 after third pop should be empty");

// Array with objects
const obj1 = { x: 1 };
const obj2 = { y: 2 };
const arr3 = [obj1, obj2];
botest.assertValueEquals(arr3.pop(), obj2, "arr3.pop() should return obj2");
botest.assertJsArrayEquals(arr3, [obj1], "arr3 after first pop should be [obj1]");
botest.assertValueEquals(arr3.pop(), obj1, "arr3.pop() should return obj1");
botest.assertJsArrayEquals(arr3, [], "arr3 after second pop should be empty");

// Array with nested arrays
const arr4 = [[1], [2, 3], []];
// botest.assertJsArrayEquals(arr4.pop() ?? [], []);
// botest.assertJsArrayEquals(arr4, [[1], [2, 3]]);
// botest.assertJsArrayEquals(arr4.pop() ?? [], [2, 3]);
// botest.assertJsArrayEquals(arr4, [[1]]);
// botest.assertJsArrayEquals(arr4.pop() ?? [], [1]);
// botest.assertJsArrayEquals(arr4, []);

// // Array with length property manually set
// const arr7: any[] = [1, 2, 3];
// (arr7 as any).length = 1;
// botest.assertValueEquals(arr7.pop(), 1);
// botest.assertJsArrayEquals(arr7, []);
// botest.assertValueEquals(arr7.pop(), undefined);

botest.assertOk();

export {};
