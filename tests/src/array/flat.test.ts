// Basic usage (depth = 1 by default)
const arr1 = [1, 2, [3, 4]];
const result1 = arr1.flat();
botest.assertJsArrayEquals(result1, [1, 2, 3, 4], "flat() with depth 1 should flatten one level");

// Depth = 0 (no flattening)
const arr2 = [1, 2, [3, 4]];
const result2 = arr2.flat(0);
botest.assertJsArrayEquals(result2, [1, 2, [3, 4]], "flat(0) should not flatten");

// Depth = 2
const arr3 = [1, 2, [3, [4, 5]]];
const result3 = arr3.flat(2);
botest.assertJsArrayEquals(result3, [1, 2, 3, 4, 5], "flat(2) should flatten two levels");

// Empty array
const emptyArr: any[] = [];
const result4 = emptyArr.flat();
botest.assertJsArrayEquals(result4, [], "flat() on empty array should return empty");

// Array without nesting
const flatArr = [1, 2, 3, 4];
const result5 = flatArr.flat();
botest.assertJsArrayEquals(
  result5,
  [1, 2, 3, 4],
  "flat() on already flat array should return same",
);

// Mixed types
const mixedArr = [1, "hello", [true, null], undefined];
const result6 = mixedArr.flat();
botest.assertJsArrayEquals(
  result6,
  [1, "hello", true, null, undefined],
  "flat() should work with mixed types",
);

// Deep nesting with depth = 3
const deepArr = [1, [2, [3, [4, [5]]]]];
const result7 = deepArr.flat(3);
botest.assertJsArrayEquals(result7, [1, 2, 3, 4, [5]], "flat(3) should flatten three levels");

// Very deep nesting with large depth
const veryDeepArr = [1, [2, [3, [4, [5]]]]];
const result8 = veryDeepArr.flat(100);
botest.assertJsArrayEquals(result8, [1, 2, 3, 4, 5], "flat(100) should fully flatten");

// // Sparse array
// const sparseArr = [1, , [3, 4]];
// const result9 = sparseArr.flat();
// botest.assertJsArrayEquals(result9, [1, undefined, 3, 4]);

// Array with empty nested arrays
const arrWithEmpty = [1, [], [3, []], 4];
const result10 = arrWithEmpty.flat();
botest.assertJsArrayEquals(result10, [1, 3, [], 4], "flat() with empty nested arrays");

// Multiple levels of empty arrays
const multiEmpty = [1, [[], 2], []];
const result11 = multiEmpty.flat(2);
botest.assertJsArrayEquals(result11, [1, 2], "flat(2) should remove empty nested arrays");

// Negative depth (treated as 0)
const arr12 = [1, [2, [3]]];
const result12 = arr12.flat(-1);
botest.assertJsArrayEquals(result12, [1, [2, [3]]], "flat(-1) should be treated as flat(0)");

// Infinity depth
const arr13 = [1, [2, [3, [4, [5]]]]];
const result13 = arr13.flat(100);
botest.assertJsArrayEquals(result13, [1, 2, 3, 4, 5], "flat(Infinity) should fully flatten");

// Complex nested structure
const complexArr = [[[1, 2], [3]], [[4, 5], 6], 7];
const result14 = complexArr.flat(2);
botest.assertJsArrayEquals(result14, [1, 2, 3, 4, 5, 6, 7], "flat(2) on complex structure");

botest.assertOk();

export {};
