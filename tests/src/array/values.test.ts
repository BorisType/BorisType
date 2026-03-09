// Basic usage with numbers
const arr1 = [1, 2, 3];
const values1 = arr1.values();
botest.assertJsArrayEquals(values1, [1, 2, 3], "arr1.values() should return [1, 2, 3]");

// Array with strings
const arr2 = ["a", "b", "c"];
const values2 = arr2.values();
botest.assertJsArrayEquals(values2, ["a", "b", "c"], "arr2.values() should return ['a', 'b', 'c']");

// Empty array
const emptyArr: any[] = [];
const values3 = emptyArr.values();
botest.assertJsArrayEquals(values3, [], "emptyArr.values() should return empty array");

// Array with undefined and null
const arr4: any[] = [undefined, null, 0, false];
const values4 = arr4.values();
botest.assertJsArrayEquals(
  values4,
  [undefined, null, 0, false],
  "arr4.values() should return [undefined, null, 0, false]",
);

// Array with objects
const obj1 = { x: 1 };
const obj2 = { y: 2 };
const arr5: any[] = [obj1, obj2];
const values5 = arr5.values();
botest.assertJsArrayEquals(values5, [obj1, obj2], "arr5.values() should return [obj1, obj2]");

// Array with nested arrays
const arr6: any[] = [
  [1, 2],
  [3, 4],
];
const values6 = arr6.values();
botest.assertJsArrayEquals(
  values6,
  [
    [1, 2],
    [3, 4],
  ],
  "arr6.values() should return [[1, 2], [3, 4]]",
);

// Mixed types array
const arr7: any[] = [1, "hello", true, null, undefined];
const values7 = arr7.values();
botest.assertJsArrayEquals(
  values7,
  [1, "hello", true, null, undefined],
  "arr7.values() should return [1, 'hello', true, null, undefined]",
);

// Single element array
const singleArr = [42];
const values8 = singleArr.values();
botest.assertJsArrayEquals(values8, [42], "singleArr.values() should return [42]");

// Array with zero and false
const arr9 = [0, false, ""];
const values9 = arr9.values();
botest.assertJsArrayEquals(values9, [0, false, ""], "arr9.values() should return [0, false, '']");

// Values is independent of array changes
const arr10 = [1, 2, 3];
const values10 = arr10.values();
arr10.push(4); // Modify array after calling values
botest.assertJsArrayEquals(
  values10,
  [1, 2, 3],
  "values10 should still be original [1, 2, 3] after arr10 modification",
); // Should still be original values

botest.assertOk();

export {};
