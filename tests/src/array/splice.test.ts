// Remove elements without adding (deleteCount only)
const arr1 = [1, 2, 3, 4, 5];
const removed1 = arr1.splice(2, 2);
botest.assertJsArrayEquals(removed1, [3, 4], "arr1.splice(2, 2) should return removed [3, 4]");
botest.assertJsArrayEquals(arr1, [1, 2, 5], "arr1 after splice should be [1, 2, 5]");

// Remove single element
const arr2 = [1, 2, 3, 4];
const removed2 = arr2.splice(1, 1);
botest.assertJsArrayEquals(removed2, [2], "arr2.splice(1, 1) should return removed [2]");
botest.assertJsArrayEquals(arr2, [1, 3, 4], "arr2 after splice should be [1, 3, 4]");

// Remove from beginning
const arr3 = [1, 2, 3, 4];
const removed3 = arr3.splice(0, 2);
botest.assertJsArrayEquals(removed3, [1, 2], "arr3.splice(0, 2) should return removed [1, 2]");
botest.assertJsArrayEquals(arr3, [3, 4], "arr3 after splice should be [3, 4]");

// Remove from end
const arr4 = [1, 2, 3, 4];
const removed4 = arr4.splice(2);
botest.assertJsArrayEquals(removed4, [3, 4], "arr4.splice(2) should return removed [3, 4]");
botest.assertJsArrayEquals(arr4, [1, 2], "arr4 after splice should be [1, 2]");

// Add elements without removing (deleteCount = 0)
const arr5 = [1, 2, 4, 5];
const removed5 = arr5.splice(2, 0, 3);
botest.assertJsArrayEquals(removed5, [], "arr5.splice(2, 0, 3) should return empty array");
botest.assertJsArrayEquals(arr5, [1, 2, 3, 4, 5], "arr5 after adding 3 should be [1, 2, 3, 4, 5]");

// Replace elements (remove and add)
const arr6 = [1, 2, 5, 6];
const removed6 = arr6.splice(2, 2, 3, 4);
botest.assertJsArrayEquals(removed6, [5, 6], "arr6.splice(2, 2, 3, 4) should return removed [5, 6]");
botest.assertJsArrayEquals(arr6, [1, 2, 3, 4], "arr6 after replacing should be [1, 2, 3, 4]");

// Add multiple elements
const arr7: any[] = [1, 2];
const removed7 = arr7.splice(1, 0, 'a', 'b', 'c');
botest.assertJsArrayEquals(removed7, [], "arr7.splice(1, 0, 'a', 'b', 'c') should return empty array");
botest.assertJsArrayEquals(arr7, [1, 'a', 'b', 'c', 2], "arr7 after adding should be [1, 'a', 'b', 'c', 2]");

// Negative start index
const arr8 = [1, 2, 3, 4, 5];
const removed8 = arr8.splice(-2, 1);
botest.assertJsArrayEquals(removed8, [4], "arr8.splice(-2, 1) should return removed [4]");
botest.assertJsArrayEquals(arr8, [1, 2, 3, 5], "arr8 after splice should be [1, 2, 3, 5]");

// Negative start index with add
const arr9 = [1, 2, 3, 5];
const removed9 = arr9.splice(-1, 0, 4);
botest.assertJsArrayEquals(removed9, [], "arr9.splice(-1, 0, 4) should return empty array");
botest.assertJsArrayEquals(arr9, [1, 2, 3, 4, 5], "arr9 after adding 4 should be [1, 2, 3, 4, 5]");

// Start index out of bounds (positive)
const arr10 = [1, 2, 3];
const removed10 = arr10.splice(5, 1);
botest.assertJsArrayEquals(removed10, [], "arr10.splice(5, 1) out of bounds should return empty array");
botest.assertJsArrayEquals(arr10, [1, 2, 3], "arr10 should remain unchanged [1, 2, 3]");

// Start index out of bounds (negative)
const arr11 = [1, 2, 3];
const removed11 = arr11.splice(-10, 2);
botest.assertJsArrayEquals(removed11, [1, 2], "arr11.splice(-10, 2) large negative should return [1, 2]");
botest.assertJsArrayEquals(arr11, [3], "arr11 after splice should be [3]");

// Delete count larger than remaining elements
const arr12 = [1, 2, 3];
const removed12 = arr12.splice(1, 10);
botest.assertJsArrayEquals(removed12, [2, 3], "arr12.splice(1, 10) should return [2, 3]");
botest.assertJsArrayEquals(arr12, [1], "arr12 after splice should be [1]");

// Empty array
const emptyArr: any[] = [];
const removed13 = emptyArr.splice(0, 1);
botest.assertJsArrayEquals(removed13, [], "emptyArr.splice(0, 1) should return empty array");
botest.assertJsArrayEquals(emptyArr, [], "emptyArr should remain empty");

// Array with one element - remove
const singleArr1 = [42];
const removed14 = singleArr1.splice(0, 1);
botest.assertJsArrayEquals(removed14, [42], "singleArr1.splice(0, 1) should return [42]");
botest.assertJsArrayEquals(singleArr1, [], "singleArr1 after splice should be empty");

// Array with one element - add
const singleArr2: any[] = [42];
const removed15 = singleArr2.splice(0, 0, 'before');
botest.assertJsArrayEquals(removed15, [], "singleArr2.splice(0, 0, 'before') should return empty array");
botest.assertJsArrayEquals(singleArr2, ['before', 42], "singleArr2 after adding should be ['before', 42]");

// Array with undefined and null
const arr13: any[] = [undefined, null, 0, false];
const removed16 = arr13.splice(1, 2, 'a', 'b');
botest.assertJsArrayEquals(removed16, [null, 0], "arr13.splice(1, 2, 'a', 'b') should return removed [null, 0]");
botest.assertJsArrayEquals(arr13, [undefined, 'a', 'b', false], "arr13 after splice should be [undefined, 'a', 'b', false]");

// Array with objects
const obj1 = { x: 1 };
const obj2 = { y: 2 };
const arr14: any[] = [obj1, obj2];
const removed17 = arr14.splice(0, 1, { z: 3 });
botest.assertJsArrayEquals(removed17, [obj1], "arr14.splice(0, 1, {z:3}) should return removed [obj1]");
botest.assertJsArrayEquals(arr14, [{ z: 3 }, obj2], "arr14 after splice should be [{z:3}, obj2]");

// Array with nested arrays
const arr15: any[] = [[1], [2, 3], []];
const removed18 = arr15.splice(1, 1, ['new']);
botest.assertJsArrayEquals(removed18, [[2, 3]], "arr15.splice(1, 1, ['new']) should return removed [[2, 3]]");
botest.assertJsArrayEquals(arr15, [[1], ['new'], []], "arr15 after splice should be [[1], ['new'], []]");

// Array with mixed types
const arr16: any[] = [1, "a", null, undefined, true];
const removed19 = arr16.splice(2, 2, 42, "hello");
botest.assertJsArrayEquals(removed19, [null, undefined], "arr16.splice(2, 2, 42, 'hello') should return removed [null, undefined]");
botest.assertJsArrayEquals(arr16, [1, "a", 42, "hello", true], "arr16 after splice should be [1, 'a', 42, 'hello', true]");

// Return value is array of removed elements
const arr17 = [1, 2, 3, 4, 5];
const removed20 = arr17.splice(1, 3);
botest.assertJsArrayEquals(removed20, [2, 3, 4], "arr17.splice(1, 3) should return removed [2, 3, 4]");
botest.assertJsArrayEquals(arr17, [1, 5], "arr17 after splice should be [1, 5]");


botest.assertOk();

export { };