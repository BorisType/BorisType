import { assertJsArrayEquals, assertValueEquals, test } from "./test";


test("Array.at() with positive index", () => {
    const arr = [10, 20, 30, 40];

    assertValueEquals(arr.at(0), 10);
    assertValueEquals(arr.at(2), 30);
    assertValueEquals(arr.at(3), 40);
});

test("Array.at() with negative index", () => {
    const arr = [10, 20, 30, 40];

    assertValueEquals(arr.at(-1), 40);
    assertValueEquals(arr.at(-2), 30);
    assertValueEquals(arr.at(-4), 10);
});

test("Array.at() out of bounds positive", () => {
    const arr = [1, 2, 3];

    assertValueEquals(arr.at(3), undefined);
    assertValueEquals(arr.at(100), undefined);
});

test("Array.at() out of bounds negative", () => {
    const arr = [1, 2, 3];

    assertValueEquals(arr.at(-4), undefined);
    assertValueEquals(arr.at(-100), undefined);
});

test("Array.at() on empty array", () => {
    const arr: any[] = [];

    assertValueEquals(arr.at(0), undefined);
    assertValueEquals(arr.at(-1), undefined);
});

test("Array.at() with undefined/null elements", () => {
    const arr = [undefined, null, 0];

    assertValueEquals(arr.at(0), undefined);
    assertValueEquals(arr.at(1), null);
    assertValueEquals(arr.at(2), 0);
});

test("Array.at() with nested arrays", () => {
    const arr = [[1], [2, 3], []];

    assertJsArrayEquals(arr.at(0), [1]);
    assertJsArrayEquals(arr.at(1), [2, 3]);
    assertJsArrayEquals(arr.at(-1), []);
});

test("Array.at() with string array", () => {
    const arr = ["a", "b", "c"];

    assertValueEquals(arr.at(0), "a");
    assertValueEquals(arr.at(-1), "c");
});

test("Array.at() with very large index", () => {
    const arr = [1, 2, 3];

    assertValueEquals(arr.at(999999), undefined);
    assertValueEquals(arr.at(-999999), undefined);
});

test("Array.at() on non-array objects", () => {
    const arr = [1, 2, 3];

    // TODO
});

test("Array.concat() with two arrays", () => {
    const arr1 = [1, 2];
    const arr2 = [3, 4];
    const result = arr1.concat(arr2);
    assertJsArrayEquals(result, [1, 2, 3, 4]);
});

test("Array.concat() with empty array", () => {
    const arr1: any[] = [];
    const arr2 = [5, 6];
    const result = arr1.concat(arr2);
    assertJsArrayEquals(result, [5, 6]);
    assertJsArrayEquals(arr2.concat(arr1), [5, 6]);
});

test("Array.concat() with multiple arrays", () => {
    const arr1 = [1];
    const arr2 = [2];
    const arr3 = [3];
    const result = arr1.concat(arr2, arr3);
    assertJsArrayEquals(result, [1, 2, 3]);
});

test("Array.concat() with undefined and null", () => {
    const arr1 = [1, undefined];
    const arr2 = [null, 2];
    const result = arr1.concat(arr2);
    assertJsArrayEquals(result, [1, undefined, null, 2]);
});

test("Array.concat() with nested arrays", () => {
    const arr1 = [[1]];
    const arr2 = [[2, 3]];
    const result = arr1.concat(arr2);
    assertJsArrayEquals(result, [[1], [2, 3]]);
});

test("Array.concat() with strings and numbers", () => {
    const arr1 = ["a", 1];
    const arr2 = ["b", 2];
    const result = arr1.concat(arr2);
    assertJsArrayEquals(result, ["a", 1, "b", 2]);
});

test("Array.copyWithin() basic usage", () => {
    const arr = [1, 2, 3, 4, 5];
    arr.copyWithin(0, 3);
    assertJsArrayEquals(arr, [4, 5, 3, 4, 5]);
});

test("Array.copyWithin() with start and end", () => {
    const arr = [1, 2, 3, 4, 5];
    arr.copyWithin(1, 3, 4);
    assertJsArrayEquals(arr, [1, 4, 3, 4, 5]);
});

test("Array.copyWithin() with negative target", () => {
    const arr = [1, 2, 3, 4, 5];
    arr.copyWithin(-2, 0, 2);
    assertJsArrayEquals(arr, [1, 2, 3, 1, 2]);
});

test("Array.copyWithin() with negative start", () => {
    const arr = [1, 2, 3, 4, 5];
    arr.copyWithin(0, -2);
    assertJsArrayEquals(arr, [4, 5, 3, 4, 5]);
});

test("Array.copyWithin() with out of bounds", () => {
    const arr = [1, 2, 3];
    arr.copyWithin(5, 1);
    assertJsArrayEquals(arr, [1, 2, 3]);
});

test("Array.copyWithin() on empty array", () => {
    const arr: any[] = [];
    arr.copyWithin(0, 1);
    assertJsArrayEquals(arr, []);
});

test("Array.copyWithin() with undefined/null elements", () => {
    const arr = [undefined, null, 1, 2];
    arr.copyWithin(1, 0, 2);
    assertJsArrayEquals(arr, [undefined, undefined, null, 2]);
});

test("Array.copyWithin() with nested arrays", () => {
    const arr = [[1], [2], [3], [4]];
    arr.copyWithin(2, 0, 2);
    assertJsArrayEquals(arr, [[1], [2], [1], [2]]);
});

test("Array.fill() basic usage", () => {
    const arr = [1, 2, 3, 4];
    arr.fill(9);
    assertJsArrayEquals(arr, [9, 9, 9, 9]);
});

test("Array.fill() with start and end", () => {
    const arr = [1, 2, 3, 4, 5];
    arr.fill(7, 1, 4);
    assertJsArrayEquals(arr, [1, 7, 7, 7, 5]);
});

test("Array.fill() with negative start", () => {
    const arr = [1, 2, 3, 4];
    arr.fill(5, -2);
    assertJsArrayEquals(arr, [1, 2, 5, 5]);
});

test("Array.fill() with negative end", () => {
    const arr = [1, 2, 3, 4];
    arr.fill(0, 1, -1);
    assertJsArrayEquals(arr, [1, 0, 0, 4]);
});

test("Array.fill() with out of bounds", () => {
    const arr = [1, 2, 3];
    arr.fill(8, 10, 20);
    assertJsArrayEquals(arr, [1, 2, 3]);
});

test("Array.fill() on empty array", () => {
    const arr: any[] = [];
    arr.fill(1);
    assertJsArrayEquals(arr, []);
});

test("Array.fill() with undefined/null", () => {
    const arr = [1, 2, 3];
    arr.fill(undefined, 1, 2);
    assertJsArrayEquals(arr, [1, undefined, 3]);
    arr.fill(null, 0, 1);
    assertJsArrayEquals(arr, [null, undefined, 3]);
});

test("Array.fill() with nested arrays", () => {
    const arr = [[1], [2], [3]];
    arr.fill([9, 9], 1);
    assertJsArrayEquals(arr, [[1], [9, 9], [9, 9]]);
});

// test("Array.fill() with string value", () => {
//     const arr = [1, 2, 3];
//     arr.fill("x", 0, 2);
//     assertJsArrayEquals(arr, ["x", "x", 3]);
// });

// test("Array.fill() basic usage", () => {
//     const arr = [1, 2, 3, 4];
//     assertValueEquals(arr.fill(9).at(-1), 9);
// });