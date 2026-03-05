// Add single element
const arr1 = [2, 3, 4];
const result1 = arr1.unshift(1);
botest.assertValueEquals(result1, 4, "arr1.unshift(1) should return new length 4"); // New length
botest.assertJsArrayEquals(arr1, [1, 2, 3, 4], "arr1 after unshift should be [1, 2, 3, 4]");

// Add multiple elements
const arr2: any[] = [4, 5];
const result2 = arr2.unshift(1, 2, 3);
botest.assertValueEquals(result2, 5, "arr2.unshift(1, 2, 3) should return new length 5"); // New length
botest.assertJsArrayEquals(arr2, [1, 2, 3, 4, 5], "arr2 after unshift should be [1, 2, 3, 4, 5]");

// Add to empty array
const emptyArr: any[] = [];
const result3 = emptyArr.unshift('first');
botest.assertValueEquals(result3, 1, "emptyArr.unshift('first') should return new length 1"); // New length
botest.assertJsArrayEquals(emptyArr, ['first'], "emptyArr after unshift should be ['first']");

// Add to array with one element
const singleArr = [2];
const result4 = singleArr.unshift(1);
botest.assertValueEquals(result4, 2, "singleArr.unshift(1) should return new length 2"); // New length
botest.assertJsArrayEquals(singleArr, [1, 2], "singleArr after unshift should be [1, 2]");

// Add undefined and null
const arr3: any[] = [3, 4];
const result5 = arr3.unshift(undefined, null);
botest.assertValueEquals(result5, 4, "arr3.unshift(undefined, null) should return new length 4"); // New length
botest.assertJsArrayEquals(arr3, [undefined, null, 3, 4], "arr3 after unshift should be [undefined, null, 3, 4]");

// Add objects
const obj1 = { x: 1 };
const obj2 = { y: 2 };
const arr4: any[] = [obj2];
const result6 = arr4.unshift(obj1);
botest.assertValueEquals(result6, 2, "arr4.unshift(obj1) should return new length 2"); // New length
botest.assertJsArrayEquals(arr4, [obj1, obj2], "arr4 after unshift should be [obj1, obj2]");

// Add nested arrays
const arr5: any[] = [[2, 3]];
const result7 = arr5.unshift([1]);
botest.assertValueEquals(result7, 2, "arr5.unshift([1]) should return new length 2"); // New length
botest.assertJsArrayEquals(arr5, [[1], [2, 3]], "arr5 after unshift should be [[1], [2, 3]]");

// Add mixed types
const arr6: any[] = [true, null];
const result8 = arr6.unshift(1, "hello");
botest.assertValueEquals(result8, 4, "arr6.unshift(1, 'hello') should return new length 4"); // New length
botest.assertJsArrayEquals(arr6, [1, "hello", true, null], "arr6 after unshift should be [1, 'hello', true, null]");

// Add strings
const arr7 = ["c", "d"];
const result9 = arr7.unshift("a", "b");
botest.assertValueEquals(result9, 4, "arr7.unshift('a', 'b') should return new length 4"); // New length
botest.assertJsArrayEquals(arr7, ["a", "b", "c", "d"], "arr7 after unshift should be ['a', 'b', 'c', 'd']");

// Return value is new length
const arr8 = [3, 4, 5];
const newLength = arr8.unshift(1, 2);
botest.assertValueEquals(newLength, 5, "newLength should be 5");
botest.assertJsArrayEquals(arr8, [1, 2, 3, 4, 5], "arr8 after unshift should be [1, 2, 3, 4, 5]");

// No arguments (should do nothing)
const arr9 = [1, 2, 3];
const result10 = arr9.unshift();
botest.assertValueEquals(result10, 3, "arr9.unshift() with no args should return length 3"); // Length unchanged
botest.assertJsArrayEquals(arr9, [1, 2, 3], "arr9 should remain unchanged [1, 2, 3]");

// Add zero
const arr10 = [2, 3];
const result11 = arr10.unshift(0);
botest.assertValueEquals(result11, 3, "arr10.unshift(0) should return new length 3"); // New length
botest.assertJsArrayEquals(arr10, [0, 2, 3], "arr10 after unshift should be [0, 2, 3]");

// Add false
const arr11 = [true, null];
const result12 = arr11.unshift(false);
botest.assertValueEquals(result12, 3, "arr11.unshift(false) should return new length 3"); // New length
botest.assertJsArrayEquals(arr11, [false, true, null], "arr11 after unshift should be [false, true, null]");

// Add empty string
const arr12 = ["b", "c"];
const result13 = arr12.unshift("");
botest.assertValueEquals(result13, 3, "arr12.unshift('') should return new length 3"); // New length
botest.assertJsArrayEquals(arr12, ["", "b", "c"], "arr12 after unshift should be ['', 'b', 'c']");


botest.assertOk();

export { };