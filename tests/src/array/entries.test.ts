// Basic usage
const arr1 = ["a", "b", "c"];
const entries1 = arr1.entries();
botest.assertJsArrayEquals(
  entries1,
  [
    [0, "a"],
    [1, "b"],
    [2, "c"],
  ],
  "entries() should return index-value pairs",
);

// Empty array
const emptyArr: any[] = [];
const entries2 = emptyArr.entries();
botest.assertJsArrayEquals(entries2, [], "entries() on empty array should return empty");

// Array with different types
const mixedArr = [1, "hello", true, null, undefined];
const entries3 = mixedArr.entries();
botest.assertJsArrayEquals(
  entries3,
  [
    [0, 1],
    [1, "hello"],
    [2, true],
    [3, null],
    [4, undefined],
  ],
  "entries() should work with mixed types",
);

// Array with nested arrays
const nestedArr = [[1, 2], ["a", "b"], []];
const entries4 = nestedArr.entries();
botest.assertJsArrayEquals(
  entries4,
  [
    [0, [1, 2]],
    [1, ["a", "b"]],
    [2, []],
  ],
  "entries() should work with nested arrays",
);

// Array with objects
const objArr = [{ name: "Alice" }, { name: "Bob" }];
const entries7 = objArr.entries();
botest.assertValueEquals(entries7.length, 2, "entries() with objects should have correct length");
botest.assertValueEquals(entries7[0][0], 0, "entries() first entry index should be 0");
botest.assertValueEquals(
  entries7[0][1].name,
  "Alice",
  "entries() first entry value.name should be Alice",
);
botest.assertValueEquals(entries7[1][0], 1, "entries() second entry index should be 1");
botest.assertValueEquals(
  entries7[1][1].name,
  "Bob",
  "entries() second entry value.name should be Bob",
);

botest.assertOk();

export {};
