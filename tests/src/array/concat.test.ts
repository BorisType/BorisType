// Two arrays
const arr1 = [1, 2];
const arr2 = [3, 4];
let result: any[] = arr1.concat(arr2);
botest.assertJsArrayEquals(result, [1, 2, 3, 4], "concat two arrays should combine them");

// Empty array
const emptyArr: any[] = [];
const arrWithValues = [5, 6];
result = emptyArr.concat(arrWithValues);
botest.assertJsArrayEquals(result, [5, 6], "empty array concat should return second array");
botest.assertJsArrayEquals(arrWithValues.concat(emptyArr), [5, 6], "concat empty array should return first array");

// Multiple arrays
const single1 = [1];
const single2 = [2];
const single3 = [3];
result = single1.concat(single2, single3);
botest.assertJsArrayEquals(result, [1, 2, 3], "concat multiple arrays should combine all");

// Undefined and null
const arrWithUndefined = [1, undefined];
const arrWithNull = [null, 2];
// @ts-ignore
result = arrWithUndefined.concat(arrWithNull);
botest.assertJsArrayEquals(result, [1, undefined, null, 2], "concat should preserve undefined and null");

// Nested arrays
const nested1 = [[1]];
const nested2 = [[2, 3]];
result = nested1.concat(nested2);
botest.assertJsArrayEquals(result, [[1], [2, 3]], "concat should preserve nested arrays");

// Strings and numbers
const mixed1 = ["a", 1];
const mixed2 = ["b", 2];
result = mixed1.concat(mixed2);
botest.assertJsArrayEquals(result, ["a", 1, "b", 2], "concat should work with mixed types");

botest.assertOk();

export {};
