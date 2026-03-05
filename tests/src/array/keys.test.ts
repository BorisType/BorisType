// Basic usage
const arr1 = ['a', 'b', 'c'];
const keys1 = arr1.keys();
botest.assertJsArrayEquals(keys1, [0, 1, 2], "keys() should return array indexes");

// Empty array
const emptyArr: any[] = [];
const keys2 = emptyArr.keys();
botest.assertJsArrayEquals(keys2, [], "keys() on empty array should return empty");

// Array with one element
const singleArr = [42];
const keys3 = singleArr.keys();
botest.assertJsArrayEquals(keys3, [0], "keys() on single element should return [0]");

// Array with mixed types
const mixedArr = [1, 'hello', true, null, undefined];
const keys4 = mixedArr.keys();
botest.assertJsArrayEquals(keys4, [0, 1, 2, 3, 4], "keys() should work with mixed types");

// Array with explicit length
const arr7: any[] = [];
const keys7 = arr7.keys();
botest.assertJsArrayEquals(keys7, [], "keys() on explicit empty array should return empty");

// // Large array (first few keys)
// const largeArr = new Array(100);
// const keys8 = largeArr.keys().slice(0, 5);
// botest.assertJsArrayEquals(keys8, [0, 1, 2, 3, 4]);

// Array with nested arrays
const nestedArr2 = [[1], [2, 3], []];
const keys9 = nestedArr2.keys();
botest.assertJsArrayEquals(keys9, [0, 1, 2], "keys() on nested arrays should return indexes");


botest.assertOk();

export { };