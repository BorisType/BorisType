import { assertJsArrayEquals, assertValueEquals, test } from "./test";


test("Array.at() comprehensive test", () => {
    // Positive index
    const arr = [10, 20, 30, 40];
    assertValueEquals(arr.at(0), 10);
    assertValueEquals(arr.at(2), 30);
    assertValueEquals(arr.at(3), 40);

    // Negative index
    assertValueEquals(arr.at(-1), 40);
    assertValueEquals(arr.at(-2), 30);
    assertValueEquals(arr.at(-4), 10);

    // Out of bounds positive
    const smallArr = [1, 2, 3];
    assertValueEquals(smallArr.at(3), undefined);
    assertValueEquals(smallArr.at(100), undefined);

    // Out of bounds negative
    assertValueEquals(smallArr.at(-4), undefined);
    assertValueEquals(smallArr.at(-100), undefined);

    // Empty array
    const emptyArr: any[] = [];
    assertValueEquals(emptyArr.at(0), undefined);
    assertValueEquals(emptyArr.at(-1), undefined);

    // Undefined/null elements
    const mixedArr = [undefined, null, 0];
    assertValueEquals(mixedArr.at(0), undefined);
    assertValueEquals(mixedArr.at(1), null);
    assertValueEquals(mixedArr.at(2), 0);

    // Nested arrays
    const nestedArr = [[1], [2, 3], []];
    assertJsArrayEquals(nestedArr.at(0)!, [1]);
    assertJsArrayEquals(nestedArr.at(1)!, [2, 3]);
    assertJsArrayEquals(nestedArr.at(-1)!, []);

    // String array
    const stringArr = ["a", "b", "c"];
    assertValueEquals(stringArr.at(0), "a");
    assertValueEquals(stringArr.at(-1), "c");

    // Very large index
    assertValueEquals(smallArr.at(999999), undefined);
    assertValueEquals(smallArr.at(-999999), undefined);
});

test("Array.concat() comprehensive test", () => {
    // Two arrays
    const arr1 = [1, 2];
    const arr2 = [3, 4];
    let result: any[] = arr1.concat(arr2);
    assertJsArrayEquals(result, [1, 2, 3, 4]);

    // Empty array
    const emptyArr: any[] = [];
    const arrWithValues = [5, 6];
    result = emptyArr.concat(arrWithValues);
    assertJsArrayEquals(result, [5, 6]);
    assertJsArrayEquals(arrWithValues.concat(emptyArr), [5, 6]);

    // Multiple arrays
    const single1 = [1];
    const single2 = [2];
    const single3 = [3];
    result = single1.concat(single2, single3);
    assertJsArrayEquals(result, [1, 2, 3]);

    // Undefined and null
    const arrWithUndefined = [1, undefined];
    const arrWithNull = [null, 2];
    // @ts-ignore
    result = arrWithUndefined.concat(arrWithNull);
    assertJsArrayEquals(result, [1, undefined, null, 2]);

    // Nested arrays
    const nested1 = [[1]];
    const nested2 = [[2, 3]];
    result = nested1.concat(nested2);
    assertJsArrayEquals(result, [[1], [2, 3]]);

    // Strings and numbers
    const mixed1 = ["a", 1];
    const mixed2 = ["b", 2];
    result = mixed1.concat(mixed2);
    assertJsArrayEquals(result, ["a", 1, "b", 2]);
});

test("Array.copyWithin() comprehensive test", () => {
    // Basic usage
    const arr1 = [1, 2, 3, 4, 5];
    arr1.copyWithin(0, 3);
    assertJsArrayEquals(arr1, [4, 5, 3, 4, 5]);

    // With start and end
    const arr2 = [1, 2, 3, 4, 5];
    arr2.copyWithin(1, 3, 4);
    assertJsArrayEquals(arr2, [1, 4, 3, 4, 5]);

    // With negative target
    const arr3 = [1, 2, 3, 4, 5];
    arr3.copyWithin(-2, 0, 2);
    assertJsArrayEquals(arr3, [1, 2, 3, 1, 2]);

    // With negative start
    const arr4 = [1, 2, 3, 4, 5];
    arr4.copyWithin(0, -2);
    assertJsArrayEquals(arr4, [4, 5, 3, 4, 5]);

    // With out of bounds
    const arr5 = [1, 2, 3];
    arr5.copyWithin(5, 1);
    assertJsArrayEquals(arr5, [1, 2, 3]);

    // On empty array
    const arr6: any[] = [];
    arr6.copyWithin(0, 1);
    assertJsArrayEquals(arr6, []);

    // With undefined/null elements
    const arr7 = [undefined, null, 1, 2];
    arr7.copyWithin(1, 0, 2);
    assertJsArrayEquals(arr7, [undefined, undefined, null, 2]);

    // With nested arrays
    const arr8 = [[1], [2], [3], [4]];
    arr8.copyWithin(2, 0, 2);
    assertJsArrayEquals(arr8, [[1], [2], [1], [2]]);
});

test("Array.entries() comprehensive test", () => {
    // Basic usage
    const arr1 = ['a', 'b', 'c'];
    const entries1 = arr1.entries();
    assertJsArrayEquals(entries1, [[0, 'a'], [1, 'b'], [2, 'c']]);

    // Empty array
    const emptyArr: any[] = [];
    const entries2 = emptyArr.entries();
    assertJsArrayEquals(entries2, []);

    // Array with different types
    const mixedArr = [1, 'hello', true, null, undefined];
    const entries3 = mixedArr.entries();
    assertJsArrayEquals(entries3, [[0, 1], [1, 'hello'], [2, true], [3, null], [4, undefined]]);

    // Array with nested arrays
    const nestedArr = [[1, 2], ['a', 'b'], []];
    const entries4 = nestedArr.entries();
    assertJsArrayEquals(entries4, [[0, [1, 2]], [1, ['a', 'b']], [2, []]]);

    // // Using iterator directly
    // const arr5 = ['x', 'y', 'z'];
    // const iterator = arr5.entries();
    // const first = iterator.next();
    // const second = iterator.next();
    // const third = iterator.next();
    // const fourth = iterator.next();

    // assertValueEquals(first.value[0], 0);
    // assertValueEquals(first.value[1], 'x');
    // assertValueEquals(first.done, false);

    // assertValueEquals(second.value[0], 1);
    // assertValueEquals(second.value[1], 'y');
    // assertValueEquals(second.done, false);

    // assertValueEquals(third.value[0], 2);
    // assertValueEquals(third.value[1], 'z');
    // assertValueEquals(third.done, false);

    // assertValueEquals(fourth.done, true);

    // // Sparse array
    // const sparseArr = [1, , 3];
    // sparseArr[5] = 6;
    // const entries6 = sparseArr.entries();
    // assertJsArrayEquals(entries6, [[0, 1], [2, 3], [5, 6]]);

    // Array with objects
    const objArr = [{name: 'Alice'}, {name: 'Bob'}];
    const entries7 = objArr.entries();
    assertValueEquals(entries7.length, 2);
    assertValueEquals(entries7[0][0], 0);
    assertValueEquals(entries7[0][1].name, 'Alice');
    assertValueEquals(entries7[1][0], 1);
    assertValueEquals(entries7[1][1].name, 'Bob');
});

test("Array.fill() comprehensive test", () => {
    // Basic usage
    const arr1 = [1, 2, 3, 4];
    arr1.fill(9);
    assertJsArrayEquals(arr1, [9, 9, 9, 9]);

    // With start and end
    const arr2 = [1, 2, 3, 4, 5];
    arr2.fill(7, 1, 4);
    assertJsArrayEquals(arr2, [1, 7, 7, 7, 5]);

    // With negative start
    const arr3 = [1, 2, 3, 4];
    arr3.fill(5, -2);
    assertJsArrayEquals(arr3, [1, 2, 5, 5]);

    // With negative end
    const arr4 = [1, 2, 3, 4];
    arr4.fill(0, 1, -1);
    assertJsArrayEquals(arr4, [1, 0, 0, 4]);

    // With out of bounds
    const arr5 = [1, 2, 3];
    arr5.fill(8, 10, 20);
    assertJsArrayEquals(arr5, [1, 2, 3]);

    // On empty array
    const arr6: any[] = [];
    arr6.fill(1);
    assertJsArrayEquals(arr6, []);

    // With undefined/null
    const arr7 = [1, 2, 3];
    // @ts-ignore
    arr7.fill(undefined, 1, 2);
    assertJsArrayEquals(arr7, [1, undefined, 3]);
    // @ts-ignore
    arr7.fill(null, 0, 1);
    assertJsArrayEquals(arr7, [null, undefined, 3]);

    // With nested arrays
    const arr8 = [[1], [2], [3]];
    arr8.fill([9, 9], 1);
    assertJsArrayEquals(arr8, [[1], [9, 9], [9, 9]]);

    // With strings
    const arr9 = [1, 2, 3];
    // @ts-ignore
    arr9.fill("x", 0, 2);
    assertJsArrayEquals(arr9, ["x", "x", 3]);

    // const arr10 = [1, 2, 3, 4];
    // assertValueEquals(arr10.fill(9).at(-1), 9);
});

test("Array.flat() comprehensive test", () => {
    // Basic usage (depth = 1 by default)
    const arr1 = [1, 2, [3, 4]];
    const result1 = arr1.flat();
    assertJsArrayEquals(result1, [1, 2, 3, 4]);

    // Depth = 0 (no flattening)
    const arr2 = [1, 2, [3, 4]];
    const result2 = arr2.flat(0);
    assertJsArrayEquals(result2, [1, 2, [3, 4]]);

    // Depth = 2
    const arr3 = [1, 2, [3, [4, 5]]];
    const result3 = arr3.flat(2);
    assertJsArrayEquals(result3, [1, 2, 3, 4, 5]);

    // Empty array
    const emptyArr: any[] = [];
    const result4 = emptyArr.flat();
    assertJsArrayEquals(result4, []);

    // Array without nesting
    const flatArr = [1, 2, 3, 4];
    const result5 = flatArr.flat();
    assertJsArrayEquals(result5, [1, 2, 3, 4]);

    // Mixed types
    const mixedArr = [1, 'hello', [true, null], undefined];
    const result6 = mixedArr.flat();
    assertJsArrayEquals(result6, [1, 'hello', true, null, undefined]);

    // Deep nesting with depth = 3
    const deepArr = [1, [2, [3, [4, [5]]]]];
    const result7 = deepArr.flat(3);
    assertJsArrayEquals(result7, [1, 2, 3, 4, [5]]);

    // Very deep nesting with large depth
    const veryDeepArr = [1, [2, [3, [4, [5]]]]];
    const result8 = veryDeepArr.flat(100);
    assertJsArrayEquals(result8, [1, 2, 3, 4, 5]);

    // // Sparse array
    // const sparseArr = [1, , [3, 4]];
    // const result9 = sparseArr.flat();
    // assertJsArrayEquals(result9, [1, undefined, 3, 4]);

    // Array with empty nested arrays
    const arrWithEmpty = [1, [], [3, []], 4];
    const result10 = arrWithEmpty.flat();
    assertJsArrayEquals(result10, [1, 3, [], 4]);

    // Multiple levels of empty arrays
    const multiEmpty = [1, [[], 2], []];
    const result11 = multiEmpty.flat(2);
    assertJsArrayEquals(result11, [1, 2]);

    // Negative depth (treated as 0)
    const arr12 = [1, [2, [3]]];
    const result12 = arr12.flat(-1);
    assertJsArrayEquals(result12, [1, [2, [3]]]);

    // Infinity depth
    const arr13 = [1, [2, [3, [4, [5]]]]];
    const result13 = arr13.flat(100);
    assertJsArrayEquals(result13, [1, 2, 3, 4, 5]);

    // Complex nested structure
    const complexArr = [[[1, 2], [3]], [[4, 5], 6], 7];
    const result14 = complexArr.flat(2);
    assertJsArrayEquals(result14, [1, 2, 3, 4, 5, 6, 7]);
});

test("Array.indexOf() comprehensive test", () => {
    // Basic usage
    const arr1 = [1, 2, 3, 4, 2];
    assertValueEquals(arr1.indexOf(2), 1);
    assertValueEquals(arr1.indexOf(3), 2);
    assertValueEquals(arr1.indexOf(5), -1);

    // Start index
    assertValueEquals(arr1.indexOf(2, 2), 4);
    assertValueEquals(arr1.indexOf(2, 5), -1);

    // Negative start index
    assertValueEquals(arr1.indexOf(2, -1), 4);
    assertValueEquals(arr1.indexOf(2, -3), 4);
    assertValueEquals(arr1.indexOf(1, -100), 0);

    // Array with strings
    const arr2 = ["a", "b", "c", "a"];
    assertValueEquals(arr2.indexOf("a"), 0);
    assertValueEquals(arr2.indexOf("a", 1), 3);
    assertValueEquals(arr2.indexOf("d"), -1);

    // Array with undefined and null
    const arr3 = [undefined, null, 0, false];
    assertValueEquals(arr3.indexOf(undefined), 0);
    assertValueEquals(arr3.indexOf(null), 1);
    assertValueEquals(arr3.indexOf(0), 2);
    assertValueEquals(arr3.indexOf(false), 3);
    assertValueEquals(arr3.indexOf(true), -1);

    // // Array with NaN
    // const arr4 = [0/0, 1, 0/0];
    // assertValueEquals(arr4.indexOf(0/0), -1); // indexOf does not find NaN

    // Array with objects
    const obj = {x: 1};
    const arr5 = [obj, {x: 1}];
    assertValueEquals(arr5.indexOf(obj), 0);
    assertValueEquals(arr5.indexOf({x: 1}), -1);

    // Array with arrays
    const subArr = [1, 2];
    const arr6 = [subArr, [1, 2]];
    assertValueEquals(arr6.indexOf(subArr), 0);
    assertValueEquals(arr6.indexOf([1, 2]), -1);

    // Empty array
    const emptyArr: any[] = [];
    assertValueEquals(emptyArr.indexOf(1), -1);

    // // Sparse array
    // const sparseArr = [1, , 3, undefined];
    // assertValueEquals(sparseArr.indexOf(undefined), 3);
    // assertValueEquals(sparseArr.indexOf(3), 2);
    // assertValueEquals(sparseArr.indexOf(2), -1);

    // Array with mixed types
    const mixedArr = [1, "1", true, null, undefined];
    assertValueEquals(mixedArr.indexOf("1"), 1);
    assertValueEquals(mixedArr.indexOf(1), 0);
    assertValueEquals(mixedArr.indexOf(true), 2);
    assertValueEquals(mixedArr.indexOf(null), 3);
    assertValueEquals(mixedArr.indexOf(undefined), 4);

    // Array with nested arrays
    const nestedArr = [[1], [2], [3]];
    assertValueEquals(nestedArr.indexOf([2]), -1);
    assertValueEquals(nestedArr.indexOf(nestedArr[1]), 1);
});

test("Array.join() comprehensive test", () => {
    // Basic usage (default comma separator)
    const arr1 = [1, 2, 3];
    assertValueEquals(arr1.join(), "1,2,3");

    // Custom separator
    assertValueEquals(arr1.join("-"), "1-2-3");
    assertValueEquals(arr1.join(" "), "1 2 3");
    assertValueEquals(arr1.join(""), "123");
    assertValueEquals(arr1.join(" and "), "1 and 2 and 3");

    // Empty separator
    assertValueEquals(arr1.join(""), "123");

    // Array with strings
    const arr2 = ["a", "b", "c"];
    assertValueEquals(arr2.join(), "a,b,c");
    assertValueEquals(arr2.join("-"), "a-b-c");

    // Array with mixed types
    const arr3 = [1, "hello", true, null, undefined];
    assertValueEquals(arr3.join(), "1,hello,true,,");
});

test("Array.keys() comprehensive test", () => {
    // Basic usage
    const arr1 = ['a', 'b', 'c'];
    const keys1 = arr1.keys();
    assertJsArrayEquals(keys1, [0, 1, 2]);

    // Empty array
    const emptyArr: any[] = [];
    const keys2 = emptyArr.keys();
    assertJsArrayEquals(keys2, []);

    // Array with one element
    const singleArr = [42];
    const keys3 = singleArr.keys();
    assertJsArrayEquals(keys3, [0]);

    // Array with mixed types
    const mixedArr = [1, 'hello', true, null, undefined];
    const keys4 = mixedArr.keys();
    assertJsArrayEquals(keys4, [0, 1, 2, 3, 4]);

    // // Sparse array
    // const sparseArr = [1, , 3, , 5];
    // const keys5 = sparseArr.keys();
    // assertJsArrayEquals(keys5, [0, 1, 2, 3, 4]);

    // // Using iterator directly
    // const arr6 = ['x', 'y', 'z'];
    // const iterator = arr6.keys();
    // const first = iterator.next();
    // const second = iterator.next();
    // const third = iterator.next();
    // const fourth = iterator.next();

    // assertValueEquals(first.value, 0);
    // assertValueEquals(first.done, false);
    // assertValueEquals(second.value, 1);
    // assertValueEquals(second.done, false);
    // assertValueEquals(third.value, 2);
    // assertValueEquals(third.done, false);
    // assertValueEquals(fourth.done, true);

    // Array with explicit length
    const arr7: any[] = [];
    const keys7 = arr7.keys();
    assertJsArrayEquals(keys7, []);

    // // Large array (first few keys)
    // const largeArr = new Array(100);
    // const keys8 = largeArr.keys().slice(0, 5);
    // assertJsArrayEquals(keys8, [0, 1, 2, 3, 4]);

    // Array with nested arrays
    const nestedArr2 = [[1], [2, 3], []];
    const keys9 = nestedArr2.keys();
    assertJsArrayEquals(keys9, [0, 1, 2]);

    // Comparison with entries() keys
    // const arr10 = ['a', 'b', 'c'];
    // const keysFromEntries = arr10.entries().map(([key]) => key);
    // const keysDirect = arr10.keys();
    // assertJsArrayEquals(keysFromEntries, keysDirect);
});

test("Array.lastIndexOf() comprehensive test", () => {
    // Basic usage
    const arr1 = [1, 2, 3, 4, 2];
    assertValueEquals(arr1.lastIndexOf(2), 4);
    assertValueEquals(arr1.lastIndexOf(3), 2);
    assertValueEquals(arr1.lastIndexOf(5), -1);

    // From index
    assertValueEquals(arr1.lastIndexOf(2, 3), 1);
    assertValueEquals(arr1.lastIndexOf(2, 0), -1);
    assertValueEquals(arr1.lastIndexOf(4, 2), -1);

    // Negative from index
    assertValueEquals(arr1.lastIndexOf(2, -1), 4);
    assertValueEquals(arr1.lastIndexOf(2, -2), 1);
    assertValueEquals(arr1.lastIndexOf(2, -3), 1);
    assertValueEquals(arr1.lastIndexOf(1, -100), -1);

    // Array with strings
    const arr2 = ["a", "b", "c", "a", "b"];
    assertValueEquals(arr2.lastIndexOf("a"), 3);
    assertValueEquals(arr2.lastIndexOf("b"), 4);
    assertValueEquals(arr2.lastIndexOf("a", 2), 0);
    assertValueEquals(arr2.lastIndexOf("d"), -1);

    // Array with undefined and null
    const arr3 = [undefined, null, 0, false, undefined];
    assertValueEquals(arr3.lastIndexOf(undefined), 4);
    assertValueEquals(arr3.lastIndexOf(null), 1);
    assertValueEquals(arr3.lastIndexOf(0), 2);
    assertValueEquals(arr3.lastIndexOf(false), 3);
    assertValueEquals(arr3.lastIndexOf(true), -1);

    // // Array with NaN
    // const arr4 = [0/0, 1, 0/0];
    // assertValueEquals(arr4.lastIndexOf(0/0), -1); // lastIndexOf does not find NaN

    // Array with objects
    const obj = {x: 1};
    const arr5 = [obj, {x: 1}, obj];
    assertValueEquals(arr5.lastIndexOf(obj), 2);
    assertValueEquals(arr5.lastIndexOf({x: 1}), -1);

    // Array with arrays
    const subArr = [1, 2];
    const arr6 = [subArr, [1, 2], subArr];
    assertValueEquals(arr6.lastIndexOf(subArr), 2);
    assertValueEquals(arr6.lastIndexOf([1, 2]), -1);

    // Empty array
    const emptyArr: any[] = [];
    assertValueEquals(emptyArr.lastIndexOf(1), -1);

    // Array with one element
    const singleArr = [42];
    assertValueEquals(singleArr.lastIndexOf(42), 0);
    assertValueEquals(singleArr.lastIndexOf(43), -1);

    // // Sparse array
    // const sparseArr = [1, , 3, undefined, , 1];
    // assertValueEquals(sparseArr.lastIndexOf(undefined), 3);
    // assertValueEquals(sparseArr.lastIndexOf(1), 5);
    // assertValueEquals(sparseArr.lastIndexOf(3), 2);

    // Array with mixed types
    const mixedArr = [1, "1", true, null, undefined, 1];
    assertValueEquals(mixedArr.lastIndexOf("1"), 1);
    assertValueEquals(mixedArr.lastIndexOf(1), 5);
    assertValueEquals(mixedArr.lastIndexOf(true), 2);
    assertValueEquals(mixedArr.lastIndexOf(null), 3);
    assertValueEquals(mixedArr.lastIndexOf(undefined), 4);

    // Array with nested arrays
    const nestedArr = [[1], [2], [1]];
    assertValueEquals(nestedArr.lastIndexOf([1]), -1);
    assertValueEquals(nestedArr.lastIndexOf(nestedArr[0]), 0);
    assertValueEquals(nestedArr.lastIndexOf(nestedArr[2]), 2);

    // From index larger than array length
    assertValueEquals(arr1.lastIndexOf(2, 10), 4);
    assertValueEquals(arr1.lastIndexOf(2, 100), 4);
});

test("Array.pop() comprehensive test", () => {
    // Basic usage
    const arr1 = [1, 2, 3];
    assertValueEquals(arr1.pop(), 3);
    assertJsArrayEquals(arr1, [1, 2]);
    assertValueEquals(arr1.pop(), 2);
    assertJsArrayEquals(arr1, [1]);
    assertValueEquals(arr1.pop(), 1);
    assertJsArrayEquals(arr1, []);
    assertValueEquals(arr1.pop(), undefined);
    assertJsArrayEquals(arr1, []);

    // Empty array
    const emptyArr: any[] = [];
    assertValueEquals(emptyArr.pop(), undefined);
    assertJsArrayEquals(emptyArr, []);

    // Array with one element
    const singleArr = [42];
    assertValueEquals(singleArr.pop(), 42);
    assertJsArrayEquals(singleArr, []);
    assertValueEquals(singleArr.pop(), undefined);

    // Array with undefined and null
    const arr2 = [undefined, null, 0];
    assertValueEquals(arr2.pop(), 0);
    assertJsArrayEquals(arr2, [undefined, null]);
    assertValueEquals(arr2.pop(), null);
    assertJsArrayEquals(arr2, [undefined]);
    assertValueEquals(arr2.pop(), undefined);
    assertJsArrayEquals(arr2, []);

    // Array with objects
    const obj1 = {x: 1};
    const obj2 = {y: 2};
    const arr3 = [obj1, obj2];
    assertValueEquals(arr3.pop(), obj2);
    assertJsArrayEquals(arr3, [obj1]);
    assertValueEquals(arr3.pop(), obj1);
    assertJsArrayEquals(arr3, []);

    // Array with nested arrays
    const arr4 = [[1], [2, 3], []];
    // assertJsArrayEquals(arr4.pop() ?? [], []);
    // assertJsArrayEquals(arr4, [[1], [2, 3]]);
    // assertJsArrayEquals(arr4.pop() ?? [], [2, 3]);
    // assertJsArrayEquals(arr4, [[1]]);
    // assertJsArrayEquals(arr4.pop() ?? [], [1]);
    // assertJsArrayEquals(arr4, []);

    // // Array with length property manually set
    // const arr7: any[] = [1, 2, 3];
    // (arr7 as any).length = 1;
    // assertValueEquals(arr7.pop(), 1);
    // assertJsArrayEquals(arr7, []);
    // assertValueEquals(arr7.pop(), undefined);
});