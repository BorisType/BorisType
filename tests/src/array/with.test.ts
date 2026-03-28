// Basic usage - replace element at index 1
const arr1 = [1, 2, 3, 4];
const result1 = arr1.with(1, 99);
botest.assertJsArrayEquals(result1, [1, 99, 3, 4], "arr1.with(1, 99) should return [1, 99, 3, 4]");
botest.assertJsArrayEquals(arr1, [1, 2, 3, 4], "arr1 original should be unchanged"); // Original unchanged

// Replace first element (index 0)
const arr2 = ["a", "b", "c"];
const result2 = arr2.with(0, "x");
botest.assertJsArrayEquals(result2, ["x", "b", "c"], "arr2.with(0, 'x') should return ['x', 'b', 'c']");
botest.assertJsArrayEquals(arr2, ["a", "b", "c"], "arr2 original should be unchanged"); // Original unchanged

// Replace last element
const arr3 = [10, 20, 30];
const result3 = arr3.with(2, 300);
botest.assertJsArrayEquals(result3, [10, 20, 300], "arr3.with(2, 300) should return [10, 20, 300]");
botest.assertJsArrayEquals(arr3, [10, 20, 30], "arr3 original should be unchanged"); // Original unchanged

// Negative index
const arr4 = [1, 2, 3, 4, 5];
const result4 = arr4.with(-1, 999);
botest.assertJsArrayEquals(result4, [1, 2, 3, 4, 999], "arr4.with(-1, 999) should return [1, 2, 3, 4, 999]");
botest.assertJsArrayEquals(arr4, [1, 2, 3, 4, 5], "arr4 original should be unchanged"); // Original unchanged

// Negative index - second to last
const arr5 = [1, 2, 3, 4, 5];
const result5 = arr5.with(-2, 888);
botest.assertJsArrayEquals(result5, [1, 2, 3, 888, 5], "arr5.with(-2, 888) should return [1, 2, 3, 888, 5]");
botest.assertJsArrayEquals(arr5, [1, 2, 3, 4, 5], "arr5 original should be unchanged"); // Original unchanged

// Single element array
const singleArr = [42];
const result6 = singleArr.with(0, 100);
botest.assertJsArrayEquals(result6, [100], "singleArr.with(0, 100) should return [100]");
botest.assertJsArrayEquals(singleArr, [42], "singleArr original should be unchanged"); // Original unchanged

// Array with undefined and null
const arr6: any[] = [undefined, null, 0, false];
const result7 = arr6.with(1, "replaced");
botest.assertJsArrayEquals(
  result7,
  [undefined, "replaced", 0, false],
  "arr6.with(1, 'replaced') should return [undefined, 'replaced', 0, false]",
);
botest.assertJsArrayEquals(arr6, [undefined, null, 0, false], "arr6 original should be unchanged"); // Original unchanged

// Array with objects
const obj1 = { x: 1 };
const obj2 = { y: 2 };
const arr7: any[] = [obj1, obj2];
const newObj = { z: 3 };
const result8 = arr7.with(0, newObj);
botest.assertJsArrayEquals(result8, [newObj, obj2], "arr7.with(0, newObj) should return [newObj, obj2]");
botest.assertJsArrayEquals(arr7, [obj1, obj2], "arr7 original should be unchanged"); // Original unchanged

// Array with nested arrays
const arr8: any[] = [
  [1, 2],
  [3, 4],
  [5, 6],
];
const result9 = arr8.with(1, [99, 100]);
botest.assertJsArrayEquals(
  result9,
  [
    [1, 2],
    [99, 100],
    [5, 6],
  ],
  "arr8.with(1, [99, 100]) should return [[1, 2], [99, 100], [5, 6]]",
);
botest.assertJsArrayEquals(
  arr8,
  [
    [1, 2],
    [3, 4],
    [5, 6],
  ],
  "arr8 original should be unchanged",
); // Original unchanged

// Mixed types array
const arr9: any[] = [1, "hello", true, null, undefined];
const result10 = arr9.with(2, false);
botest.assertJsArrayEquals(
  result10,
  [1, "hello", false, null, undefined],
  "arr9.with(2, false) should return [1, 'hello', false, null, undefined]",
);
botest.assertJsArrayEquals(arr9, [1, "hello", true, null, undefined], "arr9 original should be unchanged"); // Original unchanged

// Replace with same value (no-op functionally)
const arr10 = [1, 2, 3];
const result11 = arr10.with(1, 2);
botest.assertJsArrayEquals(result11, [1, 2, 3], "arr10.with(1, 2) should return [1, 2, 3]");
botest.assertJsArrayEquals(arr10, [1, 2, 3], "arr10 original should be unchanged"); // Original unchanged

botest.assertOk();

export {};
