// Remove elements without adding (deleteCount only)
const arr1 = [1, 2, 3, 4, 5];
const result1 = arr1.toSpliced(2, 2);
botest.assertJsArrayEquals(result1, [1, 2, 5], "arr1.toSpliced(2, 2) should return [1, 2, 5]");
botest.assertJsArrayEquals(arr1, [1, 2, 3, 4, 5], "arr1 original should be unchanged"); // Original unchanged

// Remove single element
const arr2 = [1, 2, 3, 4];
const result2 = arr2.toSpliced(1, 1);
botest.assertJsArrayEquals(result2, [1, 3, 4], "arr2.toSpliced(1, 1) should return [1, 3, 4]");
botest.assertJsArrayEquals(arr2, [1, 2, 3, 4], "arr2 original should be unchanged"); // Original unchanged

// Remove from beginning
const arr3 = [1, 2, 3, 4];
const result3 = arr3.toSpliced(0, 2);
botest.assertJsArrayEquals(result3, [3, 4], "arr3.toSpliced(0, 2) should return [3, 4]");
botest.assertJsArrayEquals(arr3, [1, 2, 3, 4], "arr3 original should be unchanged"); // Original unchanged

// Remove from end
const arr4 = [1, 2, 3, 4];
const result4 = arr4.toSpliced(2);
botest.assertJsArrayEquals(result4, [1, 2], "arr4.toSpliced(2) should return [1, 2]");
botest.assertJsArrayEquals(arr4, [1, 2, 3, 4], "arr4 original should be unchanged"); // Original unchanged

// Add elements without removing (deleteCount = 0)
const arr5 = [1, 2, 4, 5];
const result5 = arr5.toSpliced(2, 0, 3);
botest.assertJsArrayEquals(result5, [1, 2, 3, 4, 5], "arr5.toSpliced(2, 0, 3) should return [1, 2, 3, 4, 5]");
botest.assertJsArrayEquals(arr5, [1, 2, 4, 5], "arr5 original should be unchanged"); // Original unchanged

// Replace elements (remove and add)
const arr6 = [1, 2, 5, 6];
const result6 = arr6.toSpliced(2, 2, 3, 4);
botest.assertJsArrayEquals(result6, [1, 2, 3, 4], "arr6.toSpliced(2, 2, 3, 4) should return [1, 2, 3, 4]");
botest.assertJsArrayEquals(arr6, [1, 2, 5, 6], "arr6 original should be unchanged"); // Original unchanged

// Add multiple elements
const arr7: any[] = [1, 2];
const result7 = arr7.toSpliced(1, 0, "a", "b", "c");
botest.assertJsArrayEquals(result7, [1, "a", "b", "c", 2], "arr7.toSpliced(1, 0, 'a', 'b', 'c') should return [1, 'a', 'b', 'c', 2]");
botest.assertJsArrayEquals(arr7, [1, 2], "arr7 original should be unchanged"); // Original unchanged

// Negative start index
const arr8 = [1, 2, 3, 4, 5];
const result8 = arr8.toSpliced(-2, 1);
botest.assertJsArrayEquals(result8, [1, 2, 3, 5], "arr8.toSpliced(-2, 1) should return [1, 2, 3, 5]");
botest.assertJsArrayEquals(arr8, [1, 2, 3, 4, 5], "arr8 original should be unchanged"); // Original unchanged

// Negative start index with add
const arr9 = [1, 2, 3, 5];
const result9 = arr9.toSpliced(-1, 0, 4);
botest.assertJsArrayEquals(result9, [1, 2, 3, 4, 5], "arr9.toSpliced(-1, 0, 4) should return [1, 2, 3, 4, 5]");
botest.assertJsArrayEquals(arr9, [1, 2, 3, 5], "arr9 original should be unchanged"); // Original unchanged

// Start index out of bounds (positive)
const arr10 = [1, 2, 3];
const result10 = arr10.toSpliced(5, 1);
botest.assertJsArrayEquals(result10, [1, 2, 3], "arr10.toSpliced(5, 1) out of bounds should return [1, 2, 3]");
botest.assertJsArrayEquals(arr10, [1, 2, 3], "arr10 original should be unchanged"); // Original unchanged

// Start index out of bounds (negative)
const arr11 = [1, 2, 3];
const result11 = arr11.toSpliced(-10, 2);
botest.assertJsArrayEquals(result11, [3], "arr11.toSpliced(-10, 2) large negative should return [3]");
botest.assertJsArrayEquals(arr11, [1, 2, 3], "arr11 original should be unchanged"); // Original unchanged

// Delete count larger than remaining elements
const arr12 = [1, 2, 3];
const result12 = arr12.toSpliced(1, 10);
botest.assertJsArrayEquals(result12, [1], "arr12.toSpliced(1, 10) should return [1]");
botest.assertJsArrayEquals(arr12, [1, 2, 3], "arr12 original should be unchanged"); // Original unchanged

// Empty array
const emptyArr: any[] = [];
const result13 = emptyArr.toSpliced(0, 1);
botest.assertJsArrayEquals(result13, [], "emptyArr.toSpliced(0, 1) should return empty array");
botest.assertJsArrayEquals(emptyArr, [], "emptyArr original should be unchanged"); // Original unchanged

// Array with one element - remove
const singleArr1 = [42];
const result14 = singleArr1.toSpliced(0, 1);
botest.assertJsArrayEquals(result14, [], "singleArr1.toSpliced(0, 1) should return empty array");
botest.assertJsArrayEquals(singleArr1, [42], "singleArr1 original should be unchanged"); // Original unchanged

// Array with one element - add
const singleArr2: any[] = [42];
const result15 = singleArr2.toSpliced(0, 0, "before");
botest.assertJsArrayEquals(result15, ["before", 42], "singleArr2.toSpliced(0, 0, 'before') should return ['before', 42]");
botest.assertJsArrayEquals(singleArr2, [42], "singleArr2 original should be unchanged"); // Original unchanged

// Array with undefined and null
const arr13: any[] = [undefined, null, 0, false];
const result16 = arr13.toSpliced(1, 2, "a", "b");
botest.assertJsArrayEquals(
  result16,
  [undefined, "a", "b", false],
  "arr13.toSpliced(1, 2, 'a', 'b') should return [undefined, 'a', 'b', false]",
);
botest.assertJsArrayEquals(arr13, [undefined, null, 0, false], "arr13 original should be unchanged"); // Original unchanged

// Array with objects (shallow copy)
const obj1 = { x: 1 };
const obj2 = { y: 2 };
const arr14: any[] = [obj1, obj2];
const result17 = arr14.toSpliced(0, 1, { z: 3 });
botest.assertJsArrayEquals(result17, [{ z: 3 }, obj2], "arr14.toSpliced(0, 1, {z:3}) should return [{z:3}, obj2]");
botest.assertValueEquals(result17[1] === obj2, true, "result17[1] should be same reference as obj2"); // Same reference
botest.assertJsArrayEquals(arr14, [obj1, obj2], "arr14 original should be unchanged"); // Original unchanged

// Array with nested arrays (shallow copy)
const arr15: any[] = [[1], [2, 3], []];
const result18 = arr15.toSpliced(1, 1, ["new"]);
botest.assertJsArrayEquals(result18, [[1], ["new"], []], "arr15.toSpliced(1, 1, ['new']) should return [[1], ['new'], []]");
botest.assertValueEquals(result18[0] === arr15[0], true, "result18[0] should be same reference as arr15[0]"); // Same reference
botest.assertJsArrayEquals(arr15, [[1], [2, 3], []], "arr15 original should be unchanged"); // Original unchanged

// Array with mixed types
const arr16: any[] = [1, "a", null, undefined, true];
const result19 = arr16.toSpliced(2, 2, 42, "hello");
botest.assertJsArrayEquals(
  result19,
  [1, "a", 42, "hello", true],
  "arr16.toSpliced(2, 2, 42, 'hello') should return [1, 'a', 42, 'hello', true]",
);
botest.assertJsArrayEquals(arr16, [1, "a", null, undefined, true], "arr16 original should be unchanged"); // Original unchanged

// Return value is new array
const arr17 = [1, 2, 3, 4, 5];
const result20 = arr17.toSpliced(1, 3);
botest.assertValueEquals(result20 === arr17, false, "result20 should be different array reference"); // Different arrays
botest.assertJsArrayEquals(result20, [1, 5], "result20 should be [1, 5]");
botest.assertJsArrayEquals(arr17, [1, 2, 3, 4, 5], "arr17 original should be unchanged"); // Original unchanged

botest.assertOk();

export {};
