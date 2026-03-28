// Positive index
const arr = [10, 20, 30, 40];
botest.assertValueEquals(arr.at(0), 10, "at(0) should return first element");
botest.assertValueEquals(arr.at(2), 30, "at(2) should return third element");
botest.assertValueEquals(arr.at(3), 40, "at(3) should return fourth element");

// Negative index
botest.assertValueEquals(arr.at(-1), 40, "at(-1) should return last element");
botest.assertValueEquals(arr.at(-2), 30, "at(-2) should return second to last element");
botest.assertValueEquals(arr.at(-4), 10, "at(-4) should return first element from end");

// Out of bounds positive
const smallArr = [1, 2, 3];
botest.assertValueEquals(smallArr.at(3), undefined, "at(3) out of bounds should return undefined");
botest.assertValueEquals(smallArr.at(100), undefined, "at(100) out of bounds should return undefined");

// Out of bounds negative
botest.assertValueEquals(smallArr.at(-4), undefined, "at(-4) out of bounds negative should return undefined");
botest.assertValueEquals(smallArr.at(-100), undefined, "at(-100) out of bounds negative should return undefined");

// Empty array
const emptyArr: any[] = [];
botest.assertValueEquals(emptyArr.at(0), undefined, "empty array at(0) should return undefined");
botest.assertValueEquals(emptyArr.at(-1), undefined, "empty array at(-1) should return undefined");

// Undefined/null elements
const mixedArr = [undefined, null, 0];
botest.assertValueEquals(mixedArr.at(0), undefined, "at(0) should return undefined element");
botest.assertValueEquals(mixedArr.at(1), null, "at(1) should return null element");
botest.assertValueEquals(mixedArr.at(2), 0, "at(2) should return 0");

// Nested arrays
const nestedArr = [[1], [2, 3], []];
botest.assertJsArrayEquals(nestedArr.at(0)!, [1], "at(0) should return [1]");
botest.assertJsArrayEquals(nestedArr.at(1)!, [2, 3], "at(1) should return [2, 3]");
botest.assertJsArrayEquals(nestedArr.at(-1)!, [], "at(-1) should return empty array");

// String array
const stringArr = ["a", "b", "c"];
botest.assertValueEquals(stringArr.at(0), "a", "string array at(0) should return 'a'");
botest.assertValueEquals(stringArr.at(-1), "c", "string array at(-1) should return 'c'");

// Very large index
botest.assertValueEquals(smallArr.at(999999), undefined, "at(999999) very large index should return undefined");
botest.assertValueEquals(smallArr.at(-999999), undefined, "at(-999999) very large negative index should return undefined");

botest.assertOk();

export {};
