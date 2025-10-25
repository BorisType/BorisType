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
    const objArr = [{ name: 'Alice' }, { name: 'Bob' }];
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
    const obj = { x: 1 };
    const arr5 = [obj, { x: 1 }];
    assertValueEquals(arr5.indexOf(obj), 0);
    assertValueEquals(arr5.indexOf({ x: 1 }), -1);

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
    assertValueEquals(arr3.join(), "1,hello,true,,undefined"); // в JS выводится '1,hello,true,,'
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
    const obj = { x: 1 };
    const arr5 = [obj, { x: 1 }, obj];
    assertValueEquals(arr5.lastIndexOf(obj), 2);
    assertValueEquals(arr5.lastIndexOf({ x: 1 }), -1);

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
    const obj1 = { x: 1 };
    const obj2 = { y: 2 };
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

test("Array.reverse() comprehensive test", () => {
    // Basic usage
    const arr1 = [1, 2, 3, 4, 5];
    arr1.reverse();
    assertJsArrayEquals(arr1, [5, 4, 3, 2, 1]);

    // Array with even length
    const arr2 = [1, 2, 3, 4];
    arr2.reverse();
    assertJsArrayEquals(arr2, [4, 3, 2, 1]);

    // Array with odd length
    const arr3 = [1, 2, 3];
    arr3.reverse();
    assertJsArrayEquals(arr3, [3, 2, 1]);

    // Empty array
    const emptyArr: any[] = [];
    emptyArr.reverse();
    assertJsArrayEquals(emptyArr, []);

    // Array with one element
    const singleArr = [42];
    singleArr.reverse();
    assertJsArrayEquals(singleArr, [42]);

    // Array with two elements
    const arr4 = [1, 2];
    arr4.reverse();
    assertJsArrayEquals(arr4, [2, 1]);

    // Array with undefined and null
    const arr5 = [undefined, null, 0, false];
    arr5.reverse();
    assertJsArrayEquals(arr5, [false, 0, null, undefined]);

    // Array with objects
    const obj1 = { x: 1 };
    const obj2 = { y: 2 };
    const arr6 = [obj1, obj2];
    arr6.reverse();
    assertJsArrayEquals(arr6, [obj2, obj1]);

    // Array with nested arrays
    const arr7 = [[1], [2, 3], []];
    arr7.reverse();
    assertJsArrayEquals(arr7, [[], [2, 3], [1]]);

    // Array with mixed types
    const arr8 = [1, "a", null, undefined, true];
    arr8.reverse();
    assertJsArrayEquals(arr8, [true, undefined, null, "a", 1]);

    // Array with strings
    const arr9 = ["a", "b", "c", "d"];
    arr9.reverse();
    assertJsArrayEquals(arr9, ["d", "c", "b", "a"]);

    // Reverse twice returns to original
    const arr10 = [1, 2, 3, 4];
    const original = [...arr10];
    arr10.reverse();
    arr10.reverse();
    assertJsArrayEquals(arr10, original);

    // Return value is the same array
    const arr11 = [1, 2, 3];
    const result = arr11.reverse();
    assertValueEquals(result === arr11, true);
    assertJsArrayEquals(result, [3, 2, 1]);

    // // Sparse array (commented out)
    // const sparseArr = [1, , 3, , 5];
    // sparseArr.reverse();
    // assertJsArrayEquals(sparseArr, [5, , 3, , 1]);

    // // Array with NaN and Infinity (commented out)
    // const specialArr = [1, 0/0, Infinity, -Infinity];
    // specialArr.reverse();
    // assertJsArrayEquals(specialArr, [-Infinity, Infinity, 0/0, 1]);

    // // Direct iterator access (commented out)
    // const arr12 = [1, 2, 3];
    // arr12.reverse();
    // const iterator = arr12[Symbol.iterator]();
    // assertValueEquals(iterator.next().value, 3);
    // assertValueEquals(iterator.next().value, 2);
    // assertValueEquals(iterator.next().value, 1);
});

test("Array.shift() comprehensive test", () => {
    // Basic usage
    const arr1 = [1, 2, 3, 4, 5];
    assertValueEquals(arr1.shift(), 1);
    assertJsArrayEquals(arr1, [2, 3, 4, 5]);
    assertValueEquals(arr1.shift(), 2);
    assertJsArrayEquals(arr1, [3, 4, 5]);
    assertValueEquals(arr1.shift(), 3);
    assertJsArrayEquals(arr1, [4, 5]);

    // Empty array
    const emptyArr: any[] = [];
    assertValueEquals(emptyArr.shift(), undefined);
    assertJsArrayEquals(emptyArr, []);

    // Array with one element
    const singleArr = [42];
    assertValueEquals(singleArr.shift(), 42);
    assertJsArrayEquals(singleArr, []);
    assertValueEquals(singleArr.shift(), undefined);
    assertJsArrayEquals(singleArr, []);

    // Array with undefined and null
    const arr2 = [undefined, null, 0, false];
    assertValueEquals(arr2.shift(), undefined);
    assertJsArrayEquals(arr2, [null, 0, false]);
    assertValueEquals(arr2.shift(), null);
    assertJsArrayEquals(arr2, [0, false]);
    assertValueEquals(arr2.shift(), 0);
    assertJsArrayEquals(arr2, [false]);

    // Array with objects
    const obj1 = { x: 1 };
    const obj2 = { y: 2 };
    const arr3 = [obj1, obj2];
    assertValueEquals(arr3.shift(), obj1);
    assertJsArrayEquals(arr3, [obj2]);
    assertValueEquals(arr3.shift(), obj2);
    assertJsArrayEquals(arr3, []);

    // // Array with nested arrays
    // const arr4 = [[1], [2, 3], []];
    // assertJsArrayEquals(arr4.shift() ?? [], [1]);
    // assertJsArrayEquals(arr4, [[2, 3], []]);
    // assertJsArrayEquals(arr4.shift() ?? [], [2, 3]);
    // assertJsArrayEquals(arr4, [[]]);
    // assertJsArrayEquals(arr4.shift() ?? [], []);
    // assertJsArrayEquals(arr4, []);

    // Array with mixed types
    const arr5 = [1, "a", null, undefined, true];
    assertValueEquals(arr5.shift(), 1);
    assertJsArrayEquals(arr5, ["a", null, undefined, true]);
    assertValueEquals(arr5.shift(), "a");
    assertJsArrayEquals(arr5, [null, undefined, true]);
    assertValueEquals(arr5.shift(), null);
    assertJsArrayEquals(arr5, [undefined, true]);

    // Array with strings
    const arr6 = ["a", "b", "c"];
    assertValueEquals(arr6.shift(), "a");
    assertJsArrayEquals(arr6, ["b", "c"]);
    assertValueEquals(arr6.shift(), "b");
    assertJsArrayEquals(arr6, ["c"]);

    // Return value is the removed element
    const arr7 = [1, 2, 3];
    const removed = arr7.shift();
    assertValueEquals(removed, 1);
    assertJsArrayEquals(arr7, [2, 3]);

    // // Sparse array (commented out)
    // const sparseArr = [1, , 3, , 5];
    // assertValueEquals(sparseArr.shift(), 1);
    // assertJsArrayEquals(sparseArr, [, 3, , 5]);

    // // Array with NaN and Infinity (commented out)
    // const specialArr = [0/0, Infinity, -Infinity, 1];
    // assertValueEquals(specialArr.shift(), 0/0);
    // assertJsArrayEquals(specialArr, [Infinity, -Infinity, 1]);

    // // Direct iterator access (commented out)
    // const arr8 = [1, 2, 3];
    // arr8.shift();
    // const iterator = arr8[Symbol.iterator]();
    // assertValueEquals(iterator.next().value, 2);
    // assertValueEquals(iterator.next().value, 3);
});

test("Array.slice() comprehensive test", () => {
    // Basic usage - no parameters (full copy)
    const arr1 = [1, 2, 3, 4, 5];
    const result1 = arr1.slice();
    assertJsArrayEquals(result1, [1, 2, 3, 4, 5]);
    assertJsArrayEquals(arr1, [1, 2, 3, 4, 5]); // Original unchanged

    // With start index
    const result2 = arr1.slice(2);
    assertJsArrayEquals(result2, [3, 4, 5]);

    // With start and end index
    const result3 = arr1.slice(1, 4);
    assertJsArrayEquals(result3, [2, 3, 4]);

    // Negative start index
    const result4 = arr1.slice(-3);
    assertJsArrayEquals(result4, [3, 4, 5]);

    // Negative end index
    const result5 = arr1.slice(1, -1);
    assertJsArrayEquals(result5, [2, 3, 4]);

    // Both negative indices
    const result6 = arr1.slice(-4, -1);
    assertJsArrayEquals(result6, [2, 3, 4]);

    // Start index out of bounds (positive)
    const result7 = arr1.slice(10);
    assertJsArrayEquals(result7, []);

    // Start index out of bounds (negative)
    const result8 = arr1.slice(-10);
    assertJsArrayEquals(result8, [1, 2, 3, 4, 5]);

    // End index out of bounds
    const result9 = arr1.slice(2, 10);
    assertJsArrayEquals(result9, [3, 4, 5]);

    // Start > end (empty result)
    const result10 = arr1.slice(3, 2);
    assertJsArrayEquals(result10, []);

    // Empty array
    const emptyArr: any[] = [];
    const result11 = emptyArr.slice();
    assertJsArrayEquals(result11, []);

    // Array with one element
    const singleArr = [42];
    const result12 = singleArr.slice();
    assertJsArrayEquals(result12, [42]);
    const result13 = singleArr.slice(0, 1);
    assertJsArrayEquals(result13, [42]);

    // Array with undefined and null
    const arr2 = [undefined, null, 0, false];
    const result14 = arr2.slice(1, 3);
    assertJsArrayEquals(result14, [null, 0]);

    // Array with objects (shallow copy)
    const obj1 = { x: 1 };
    const obj2 = { y: 2 };
    const arr3 = [obj1, obj2];
    const result15 = arr3.slice();
    assertJsArrayEquals(result15, [obj1, obj2]);
    assertValueEquals(result15[0] === obj1, true); // Same reference

    // Array with nested arrays (shallow copy)
    const arr4 = [[1], [2, 3], []];
    const result16 = arr4.slice(1);
    assertJsArrayEquals(result16, [[2, 3], []]);
    assertValueEquals(result16[0] === arr4[1], true); // Same reference

    // Array with mixed types
    const arr5 = [1, "a", null, undefined, true];
    const result17 = arr5.slice(2, 5);
    assertJsArrayEquals(result17, [null, undefined, true]);

    // Array with strings
    const arr6 = ["a", "b", "c", "d"];
    const result18 = arr6.slice(1, 3);
    assertJsArrayEquals(result18, ["b", "c"]);

    // Return value is new array
    const arr7 = [1, 2, 3];
    const result19 = arr7.slice();
    assertValueEquals(result19 === arr7, false); // Different arrays
    assertJsArrayEquals(result19, arr7); // Same content

    // // Sparse array (commented out)
    // const sparseArr = [1, , 3, , 5];
    // const result20 = sparseArr.slice(1, 4);
    // assertJsArrayEquals(result20, [, 3, ]);

    // // Array with NaN and Infinity (commented out)
    // const specialArr = [1, 0/0, Infinity, -Infinity];
    // const result21 = specialArr.slice(1, 3);
    // assertJsArrayEquals(result21, [0/0, Infinity]);

    // // Direct iterator access (commented out)
    // const arr8 = [1, 2, 3, 4, 5];
    // const result22 = arr8.slice(1, 4);
    // const iterator = result22[Symbol.iterator]();
    // assertValueEquals(iterator.next().value, 2);
    // assertValueEquals(iterator.next().value, 3);
    // assertValueEquals(iterator.next().value, 4);
});

test("Array.splice() comprehensive test", () => {
    // Remove elements without adding (deleteCount only)
    const arr1 = [1, 2, 3, 4, 5];
    const removed1 = arr1.splice(2, 2);
    assertJsArrayEquals(removed1, [3, 4]);
    assertJsArrayEquals(arr1, [1, 2, 5]);

    // Remove single element
    const arr2 = [1, 2, 3, 4];
    const removed2 = arr2.splice(1, 1);
    assertJsArrayEquals(removed2, [2]);
    assertJsArrayEquals(arr2, [1, 3, 4]);

    // Remove from beginning
    const arr3 = [1, 2, 3, 4];
    const removed3 = arr3.splice(0, 2);
    assertJsArrayEquals(removed3, [1, 2]);
    assertJsArrayEquals(arr3, [3, 4]);

    // Remove from end
    const arr4 = [1, 2, 3, 4];
    const removed4 = arr4.splice(2);
    assertJsArrayEquals(removed4, [3, 4]);
    assertJsArrayEquals(arr4, [1, 2]);

    // Add elements without removing (deleteCount = 0)
    const arr5 = [1, 2, 4, 5];
    const removed5 = arr5.splice(2, 0, 3);
    assertJsArrayEquals(removed5, []);
    assertJsArrayEquals(arr5, [1, 2, 3, 4, 5]);

    // Replace elements (remove and add)
    const arr6 = [1, 2, 5, 6];
    const removed6 = arr6.splice(2, 2, 3, 4);
    assertJsArrayEquals(removed6, [5, 6]);
    assertJsArrayEquals(arr6, [1, 2, 3, 4]);

    // Add multiple elements
    const arr7: any[] = [1, 2];
    const removed7 = arr7.splice(1, 0, 'a', 'b', 'c');
    assertJsArrayEquals(removed7, []);
    assertJsArrayEquals(arr7, [1, 'a', 'b', 'c', 2]);

    // Negative start index
    const arr8 = [1, 2, 3, 4, 5];
    const removed8 = arr8.splice(-2, 1);
    assertJsArrayEquals(removed8, [4]);
    assertJsArrayEquals(arr8, [1, 2, 3, 5]);

    // Negative start index with add
    const arr9 = [1, 2, 3, 5];
    const removed9 = arr9.splice(-1, 0, 4);
    assertJsArrayEquals(removed9, []);
    assertJsArrayEquals(arr9, [1, 2, 3, 4, 5]);

    // Start index out of bounds (positive)
    const arr10 = [1, 2, 3];
    const removed10 = arr10.splice(5, 1);
    assertJsArrayEquals(removed10, []);
    assertJsArrayEquals(arr10, [1, 2, 3]);

    // Start index out of bounds (negative)
    const arr11 = [1, 2, 3];
    const removed11 = arr11.splice(-10, 2);
    assertJsArrayEquals(removed11, [1, 2]);
    assertJsArrayEquals(arr11, [3]);

    // Delete count larger than remaining elements
    const arr12 = [1, 2, 3];
    const removed12 = arr12.splice(1, 10);
    assertJsArrayEquals(removed12, [2, 3]);
    assertJsArrayEquals(arr12, [1]);

    // Empty array
    const emptyArr: any[] = [];
    const removed13 = emptyArr.splice(0, 1);
    assertJsArrayEquals(removed13, []);
    assertJsArrayEquals(emptyArr, []);

    // Array with one element - remove
    const singleArr1 = [42];
    const removed14 = singleArr1.splice(0, 1);
    assertJsArrayEquals(removed14, [42]);
    assertJsArrayEquals(singleArr1, []);

    // Array with one element - add
    const singleArr2: any[] = [42];
    const removed15 = singleArr2.splice(0, 0, 'before');
    assertJsArrayEquals(removed15, []);
    assertJsArrayEquals(singleArr2, ['before', 42]);

    // Array with undefined and null
    const arr13: any[] = [undefined, null, 0, false];
    const removed16 = arr13.splice(1, 2, 'a', 'b');
    assertJsArrayEquals(removed16, [null, 0]);
    assertJsArrayEquals(arr13, [undefined, 'a', 'b', false]);

    // Array with objects
    const obj1 = { x: 1 };
    const obj2 = { y: 2 };
    const arr14: any[] = [obj1, obj2];
    const removed17 = arr14.splice(0, 1, { z: 3 });
    assertJsArrayEquals(removed17, [obj1]);
    assertJsArrayEquals(arr14, [{ z: 3 }, obj2]);

    // Array with nested arrays
    const arr15: any[] = [[1], [2, 3], []];
    const removed18 = arr15.splice(1, 1, ['new']);
    assertJsArrayEquals(removed18, [[2, 3]]);
    assertJsArrayEquals(arr15, [[1], ['new'], []]);

    // Array with mixed types
    const arr16: any[] = [1, "a", null, undefined, true];
    const removed19 = arr16.splice(2, 2, 42, "hello");
    assertJsArrayEquals(removed19, [null, undefined]);
    assertJsArrayEquals(arr16, [1, "a", 42, "hello", true]);

    // Return value is array of removed elements
    const arr17 = [1, 2, 3, 4, 5];
    const removed20 = arr17.splice(1, 3);
    assertJsArrayEquals(removed20, [2, 3, 4]);
    assertJsArrayEquals(arr17, [1, 5]);

    // // Sparse array (commented out)
    // const sparseArr = [1, , 3, , 5];
    // const removed21 = sparseArr.splice(1, 2, 'a', 'b');
    // assertJsArrayEquals(removed21, [, 3]);
    // assertJsArrayEquals(sparseArr, [1, 'a', 'b', , 5]);

    // // Array with NaN and Infinity (commented out)
    // const specialArr = [1, 0/0, Infinity, -Infinity];
    // const removed22 = specialArr.splice(1, 2, 2, 3);
    // assertJsArrayEquals(removed22, [0/0, Infinity]);
    // assertJsArrayEquals(specialArr, [1, 2, 3, -Infinity]);

    // // Direct iterator access (commented out)
    // const arr18 = [1, 2, 3, 4, 5];
    // arr18.splice(1, 2, 'a', 'b');
    // const iterator = arr18[Symbol.iterator]();
    // assertValueEquals(iterator.next().value, 1);
    // assertValueEquals(iterator.next().value, 'a');
    // assertValueEquals(iterator.next().value, 'b');
    // assertValueEquals(iterator.next().value, 4);
    // assertValueEquals(iterator.next().value, 5);
});

test("Array.toReversed() comprehensive test", () => {
    // Basic usage
    const arr1 = [1, 2, 3, 4, 5];
    const result1 = arr1.toReversed();
    assertJsArrayEquals(result1, [5, 4, 3, 2, 1]);
    assertJsArrayEquals(arr1, [1, 2, 3, 4, 5]); // Original unchanged

    // Array with even length
    const arr2 = [1, 2, 3, 4];
    const result2 = arr2.toReversed();
    assertJsArrayEquals(result2, [4, 3, 2, 1]);
    assertJsArrayEquals(arr2, [1, 2, 3, 4]); // Original unchanged

    // Array with odd length
    const arr3 = [1, 2, 3];
    const result3 = arr3.toReversed();
    assertJsArrayEquals(result3, [3, 2, 1]);
    assertJsArrayEquals(arr3, [1, 2, 3]); // Original unchanged

    // Empty array
    const emptyArr: any[] = [];
    const result4 = emptyArr.toReversed();
    assertJsArrayEquals(result4, []);
    assertJsArrayEquals(emptyArr, []); // Original unchanged

    // Array with one element
    const singleArr = [42];
    const result5 = singleArr.toReversed();
    assertJsArrayEquals(result5, [42]);
    assertJsArrayEquals(singleArr, [42]); // Original unchanged

    // Array with two elements
    const arr4 = [1, 2];
    const result6 = arr4.toReversed();
    assertJsArrayEquals(result6, [2, 1]);
    assertJsArrayEquals(arr4, [1, 2]); // Original unchanged

    // Array with undefined and null
    const arr5 = [undefined, null, 0, false];
    const result7 = arr5.toReversed();
    assertJsArrayEquals(result7, [false, 0, null, undefined]);
    assertJsArrayEquals(arr5, [undefined, null, 0, false]); // Original unchanged

    // Array with objects (shallow copy)
    const obj1 = { x: 1 };
    const obj2 = { y: 2 };
    const arr6 = [obj1, obj2];
    const result8 = arr6.toReversed();
    assertJsArrayEquals(result8, [obj2, obj1]);
    assertValueEquals(result8[0] === obj2, true); // Same reference
    assertJsArrayEquals(arr6, [obj1, obj2]); // Original unchanged

    // Array with nested arrays (shallow copy)
    const arr7 = [[1], [2, 3], []];
    const result9 = arr7.toReversed();
    assertJsArrayEquals(result9, [[], [2, 3], [1]]);
    assertValueEquals(result9[1] === arr7[1], true); // Same reference
    assertJsArrayEquals(arr7, [[1], [2, 3], []]); // Original unchanged

    // Array with mixed types
    const arr8 = [1, "a", null, undefined, true];
    const result10 = arr8.toReversed();
    assertJsArrayEquals(result10, [true, undefined, null, "a", 1]);
    assertJsArrayEquals(arr8, [1, "a", null, undefined, true]); // Original unchanged

    // Array with strings
    const arr9 = ["a", "b", "c", "d"];
    const result11 = arr9.toReversed();
    assertJsArrayEquals(result11, ["d", "c", "b", "a"]);
    assertJsArrayEquals(arr9, ["a", "b", "c", "d"]); // Original unchanged

    // Return value is new array
    const arr10 = [1, 2, 3];
    const result12 = arr10.toReversed();
    assertValueEquals(result12 === arr10, false); // Different arrays
    assertJsArrayEquals(result12, [3, 2, 1]);
    assertJsArrayEquals(arr10, [1, 2, 3]); // Original unchanged

    // Multiple calls return same result
    const arr11 = [1, 2, 3, 4];
    const result13 = arr11.toReversed();
    const result14 = arr11.toReversed();
    assertJsArrayEquals(result13, result14);
    assertJsArrayEquals(result13, [4, 3, 2, 1]);
    assertJsArrayEquals(arr11, [1, 2, 3, 4]); // Original unchanged

    // // Sparse array (commented out)
    // const sparseArr = [1, , 3, , 5];
    // const result15 = sparseArr.toReversed();
    // assertJsArrayEquals(result15, [5, , 3, , 1]);
    // assertJsArrayEquals(sparseArr, [1, , 3, , 5]); // Original unchanged

    // // Array with NaN and Infinity (commented out)
    // const specialArr = [1, 0/0, Infinity, -Infinity];
    // const result16 = specialArr.toReversed();
    // assertJsArrayEquals(result16, [-Infinity, Infinity, 0/0, 1]);
    // assertJsArrayEquals(specialArr, [1, 0/0, Infinity, -Infinity]); // Original unchanged

    // // Direct iterator access (commented out)
    // const arr12 = [1, 2, 3];
    // const result17 = arr12.toReversed();
    // const iterator = result17[Symbol.iterator]();
    // assertValueEquals(iterator.next().value, 3);
    // assertValueEquals(iterator.next().value, 2);
    // assertValueEquals(iterator.next().value, 1);
});

test("Array.toSpliced() comprehensive test", () => {
    // Remove elements without adding (deleteCount only)
    const arr1 = [1, 2, 3, 4, 5];
    const result1 = arr1.toSpliced(2, 2);
    assertJsArrayEquals(result1, [1, 2, 5]);
    assertJsArrayEquals(arr1, [1, 2, 3, 4, 5]); // Original unchanged

    // Remove single element
    const arr2 = [1, 2, 3, 4];
    const result2 = arr2.toSpliced(1, 1);
    assertJsArrayEquals(result2, [1, 3, 4]);
    assertJsArrayEquals(arr2, [1, 2, 3, 4]); // Original unchanged

    // Remove from beginning
    const arr3 = [1, 2, 3, 4];
    const result3 = arr3.toSpliced(0, 2);
    assertJsArrayEquals(result3, [3, 4]);
    assertJsArrayEquals(arr3, [1, 2, 3, 4]); // Original unchanged

    // Remove from end
    const arr4 = [1, 2, 3, 4];
    const result4 = arr4.toSpliced(2);
    assertJsArrayEquals(result4, [1, 2]);
    assertJsArrayEquals(arr4, [1, 2, 3, 4]); // Original unchanged

    // Add elements without removing (deleteCount = 0)
    const arr5 = [1, 2, 4, 5];
    const result5 = arr5.toSpliced(2, 0, 3);
    assertJsArrayEquals(result5, [1, 2, 3, 4, 5]);
    assertJsArrayEquals(arr5, [1, 2, 4, 5]); // Original unchanged

    // Replace elements (remove and add)
    const arr6 = [1, 2, 5, 6];
    const result6 = arr6.toSpliced(2, 2, 3, 4);
    assertJsArrayEquals(result6, [1, 2, 3, 4]);
    assertJsArrayEquals(arr6, [1, 2, 5, 6]); // Original unchanged

    // Add multiple elements
    const arr7: any[] = [1, 2];
    const result7 = arr7.toSpliced(1, 0, 'a', 'b', 'c');
    assertJsArrayEquals(result7, [1, 'a', 'b', 'c', 2]);
    assertJsArrayEquals(arr7, [1, 2]); // Original unchanged

    // Negative start index
    const arr8 = [1, 2, 3, 4, 5];
    const result8 = arr8.toSpliced(-2, 1);
    assertJsArrayEquals(result8, [1, 2, 3, 5]);
    assertJsArrayEquals(arr8, [1, 2, 3, 4, 5]); // Original unchanged

    // Negative start index with add
    const arr9 = [1, 2, 3, 5];
    const result9 = arr9.toSpliced(-1, 0, 4);
    assertJsArrayEquals(result9, [1, 2, 3, 4, 5]);
    assertJsArrayEquals(arr9, [1, 2, 3, 5]); // Original unchanged

    // Start index out of bounds (positive)
    const arr10 = [1, 2, 3];
    const result10 = arr10.toSpliced(5, 1);
    assertJsArrayEquals(result10, [1, 2, 3]);
    assertJsArrayEquals(arr10, [1, 2, 3]); // Original unchanged

    // Start index out of bounds (negative)
    const arr11 = [1, 2, 3];
    const result11 = arr11.toSpliced(-10, 2);
    assertJsArrayEquals(result11, [3]);
    assertJsArrayEquals(arr11, [1, 2, 3]); // Original unchanged

    // Delete count larger than remaining elements
    const arr12 = [1, 2, 3];
    const result12 = arr12.toSpliced(1, 10);
    assertJsArrayEquals(result12, [1]);
    assertJsArrayEquals(arr12, [1, 2, 3]); // Original unchanged

    // Empty array
    const emptyArr: any[] = [];
    const result13 = emptyArr.toSpliced(0, 1);
    assertJsArrayEquals(result13, []);
    assertJsArrayEquals(emptyArr, []); // Original unchanged

    // Array with one element - remove
    const singleArr1 = [42];
    const result14 = singleArr1.toSpliced(0, 1);
    assertJsArrayEquals(result14, []);
    assertJsArrayEquals(singleArr1, [42]); // Original unchanged

    // Array with one element - add
    const singleArr2: any[] = [42];
    const result15 = singleArr2.toSpliced(0, 0, 'before');
    assertJsArrayEquals(result15, ['before', 42]);
    assertJsArrayEquals(singleArr2, [42]); // Original unchanged

    // Array with undefined and null
    const arr13: any[] = [undefined, null, 0, false];
    const result16 = arr13.toSpliced(1, 2, 'a', 'b');
    assertJsArrayEquals(result16, [undefined, 'a', 'b', false]);
    assertJsArrayEquals(arr13, [undefined, null, 0, false]); // Original unchanged

    // Array with objects (shallow copy)
    const obj1 = { x: 1 };
    const obj2 = { y: 2 };
    const arr14: any[] = [obj1, obj2];
    const result17 = arr14.toSpliced(0, 1, { z: 3 });
    assertJsArrayEquals(result17, [{ z: 3 }, obj2]);
    assertValueEquals(result17[1] === obj2, true); // Same reference
    assertJsArrayEquals(arr14, [obj1, obj2]); // Original unchanged

    // Array with nested arrays (shallow copy)
    const arr15: any[] = [[1], [2, 3], []];
    const result18 = arr15.toSpliced(1, 1, ['new']);
    assertJsArrayEquals(result18, [[1], ['new'], []]);
    assertValueEquals(result18[0] === arr15[0], true); // Same reference
    assertJsArrayEquals(arr15, [[1], [2, 3], []]); // Original unchanged

    // Array with mixed types
    const arr16: any[] = [1, "a", null, undefined, true];
    const result19 = arr16.toSpliced(2, 2, 42, "hello");
    assertJsArrayEquals(result19, [1, "a", 42, "hello", true]);
    assertJsArrayEquals(arr16, [1, "a", null, undefined, true]); // Original unchanged

    // Return value is new array
    const arr17 = [1, 2, 3, 4, 5];
    const result20 = arr17.toSpliced(1, 3);
    assertValueEquals(result20 === arr17, false); // Different arrays
    assertJsArrayEquals(result20, [1, 5]);
    assertJsArrayEquals(arr17, [1, 2, 3, 4, 5]); // Original unchanged

    // // Sparse array (commented out)
    // const sparseArr = [1, , 3, , 5];
    // const result21 = sparseArr.toSpliced(1, 2, 'a', 'b');
    // assertJsArrayEquals(result21, [1, 'a', 'b', , 5]);
    // assertJsArrayEquals(sparseArr, [1, , 3, , 5]); // Original unchanged

    // // Array with NaN and Infinity (commented out)
    // const specialArr = [1, 0/0, Infinity, -Infinity];
    // const result22 = specialArr.toSpliced(1, 2, 2, 3);
    // assertJsArrayEquals(result22, [1, 2, 3, -Infinity]);
    // assertJsArrayEquals(specialArr, [1, 0/0, Infinity, -Infinity]); // Original unchanged

    // // Direct iterator access (commented out)
    // const arr18 = [1, 2, 3, 4, 5];
    // const result23 = arr18.toSpliced(1, 2, 'a', 'b');
    // const iterator = result23[Symbol.iterator]();
    // assertValueEquals(iterator.next().value, 1);
    // assertValueEquals(iterator.next().value, 'a');
    // assertValueEquals(iterator.next().value, 'b');
    // assertValueEquals(iterator.next().value, 4);
    // assertValueEquals(iterator.next().value, 5);
});

test("Array.unshift() comprehensive test", () => {
    // Add single element
    const arr1 = [2, 3, 4];
    const result1 = arr1.unshift(1);
    assertValueEquals(result1, 4); // New length
    assertJsArrayEquals(arr1, [1, 2, 3, 4]);

    // Add multiple elements
    const arr2: any[] = [4, 5];
    const result2 = arr2.unshift(1, 2, 3);
    assertValueEquals(result2, 5); // New length
    assertJsArrayEquals(arr2, [1, 2, 3, 4, 5]);

    // Add to empty array
    const emptyArr: any[] = [];
    const result3 = emptyArr.unshift('first');
    assertValueEquals(result3, 1); // New length
    assertJsArrayEquals(emptyArr, ['first']);

    // Add to array with one element
    const singleArr = [2];
    const result4 = singleArr.unshift(1);
    assertValueEquals(result4, 2); // New length
    assertJsArrayEquals(singleArr, [1, 2]);

    // Add undefined and null
    const arr3: any[] = [3, 4];
    const result5 = arr3.unshift(undefined, null);
    assertValueEquals(result5, 4); // New length
    assertJsArrayEquals(arr3, [undefined, null, 3, 4]);

    // Add objects
    const obj1 = { x: 1 };
    const obj2 = { y: 2 };
    const arr4: any[] = [obj2];
    const result6 = arr4.unshift(obj1);
    assertValueEquals(result6, 2); // New length
    assertJsArrayEquals(arr4, [obj1, obj2]);

    // Add nested arrays
    const arr5: any[] = [[2, 3]];
    const result7 = arr5.unshift([1]);
    assertValueEquals(result7, 2); // New length
    assertJsArrayEquals(arr5, [[1], [2, 3]]);

    // Add mixed types
    const arr6: any[] = [true, null];
    const result8 = arr6.unshift(1, "hello");
    assertValueEquals(result8, 4); // New length
    assertJsArrayEquals(arr6, [1, "hello", true, null]);

    // Add strings
    const arr7 = ["c", "d"];
    const result9 = arr7.unshift("a", "b");
    assertValueEquals(result9, 4); // New length
    assertJsArrayEquals(arr7, ["a", "b", "c", "d"]);

    // Return value is new length
    const arr8 = [3, 4, 5];
    const newLength = arr8.unshift(1, 2);
    assertValueEquals(newLength, 5);
    assertJsArrayEquals(arr8, [1, 2, 3, 4, 5]);

    // No arguments (should do nothing)
    const arr9 = [1, 2, 3];
    const result10 = arr9.unshift();
    assertValueEquals(result10, 3); // Length unchanged
    assertJsArrayEquals(arr9, [1, 2, 3]);

    // Add zero
    const arr10 = [2, 3];
    const result11 = arr10.unshift(0);
    assertValueEquals(result11, 3); // New length
    assertJsArrayEquals(arr10, [0, 2, 3]);

    // Add false
    const arr11 = [true, null];
    const result12 = arr11.unshift(false);
    assertValueEquals(result12, 3); // New length
    assertJsArrayEquals(arr11, [false, true, null]);

    // Add empty string
    const arr12 = ["b", "c"];
    const result13 = arr12.unshift("");
    assertValueEquals(result13, 3); // New length
    assertJsArrayEquals(arr12, ["", "b", "c"]);

    // // Sparse array (commented out)
    // const sparseArr = [3, , 5];
    // const result14 = sparseArr.unshift(1, 2);
    // assertValueEquals(result14, 5);
    // assertJsArrayEquals(sparseArr, [1, 2, 3, , 5]);

    // // Array with NaN and Infinity (commented out)
    // const specialArr = [Infinity, 2];
    // const result15 = specialArr.unshift(0/0, -Infinity);
    // assertValueEquals(result15, 4);
    // assertJsArrayEquals(specialArr, [0/0, -Infinity, Infinity, 2]);

    // // Direct iterator access (commented out)
    // const arr13 = [3, 4, 5];
    // arr13.unshift(1, 2);
    // const iterator = arr13[Symbol.iterator]();
    // assertValueEquals(iterator.next().value, 1);
    // assertValueEquals(iterator.next().value, 2);
    // assertValueEquals(iterator.next().value, 3);
    // assertValueEquals(iterator.next().value, 4);
    // assertValueEquals(iterator.next().value, 5);
});

test("Array.values() comprehensive test", () => {
    // Basic usage with numbers
    const arr1 = [1, 2, 3];
    const values1 = arr1.values();
    assertJsArrayEquals(values1, [1, 2, 3]);

    // Array with strings
    const arr2 = ["a", "b", "c"];
    const values2 = arr2.values();
    assertJsArrayEquals(values2, ["a", "b", "c"]);

    // Empty array
    const emptyArr: any[] = [];
    const values3 = emptyArr.values();
    assertJsArrayEquals(values3, []);

    // Array with undefined and null
    const arr4: any[] = [undefined, null, 0, false];
    const values4 = arr4.values();
    assertJsArrayEquals(values4, [undefined, null, 0, false]);

    // Array with objects
    const obj1 = { x: 1 };
    const obj2 = { y: 2 };
    const arr5: any[] = [obj1, obj2];
    const values5 = arr5.values();
    assertJsArrayEquals(values5, [obj1, obj2]);

    // Array with nested arrays
    const arr6: any[] = [[1, 2], [3, 4]];
    const values6 = arr6.values();
    assertJsArrayEquals(values6, [[1, 2], [3, 4]]);

    // Mixed types array
    const arr7: any[] = [1, "hello", true, null, undefined];
    const values7 = arr7.values();
    assertJsArrayEquals(values7, [1, "hello", true, null, undefined]);

    // Single element array
    const singleArr = [42];
    const values8 = singleArr.values();
    assertJsArrayEquals(values8, [42]);

    // Array with zero and false
    const arr9 = [0, false, ""];
    const values9 = arr9.values();
    assertJsArrayEquals(values9, [0, false, ""]);

    // Values is independent of array changes
    const arr10 = [1, 2, 3];
    const values10 = arr10.values();
    arr10.push(4); // Modify array after calling values
    assertJsArrayEquals(values10, [1, 2, 3]); // Should still be original values

    // // Sparse array (commented out)
    // const sparseArr = [1, , 3];
    // const values11 = sparseArr.values();
    // assertJsArrayEquals(values11, [1, undefined, 3]);

    // // Array with NaN and Infinity (commented out)
    // const specialArr = [0/0, Infinity, -Infinity];
    // const values12 = specialArr.values();
    // assertJsArrayEquals(values12, [0/0, Infinity, -Infinity]);

    // // Direct iterator access (commented out)
    // const arr11 = [1, 2, 3];
    // const values13 = arr11.values();
    // // In BorisType, values() returns an array, not an iterator
    // assertJsArrayEquals(values13, [1, 2, 3]);
});

test("Array.with() comprehensive test", () => {
    // Basic usage - replace element at index 1
    const arr1 = [1, 2, 3, 4];
    const result1 = arr1.with(1, 99);
    assertJsArrayEquals(result1, [1, 99, 3, 4]);
    assertJsArrayEquals(arr1, [1, 2, 3, 4]); // Original unchanged

    // Replace first element (index 0)
    const arr2 = ['a', 'b', 'c'];
    const result2 = arr2.with(0, 'x');
    assertJsArrayEquals(result2, ['x', 'b', 'c']);
    assertJsArrayEquals(arr2, ['a', 'b', 'c']); // Original unchanged

    // Replace last element
    const arr3 = [10, 20, 30];
    const result3 = arr3.with(2, 300);
    assertJsArrayEquals(result3, [10, 20, 300]);
    assertJsArrayEquals(arr3, [10, 20, 30]); // Original unchanged

    // Negative index
    const arr4 = [1, 2, 3, 4, 5];
    const result4 = arr4.with(-1, 999);
    assertJsArrayEquals(result4, [1, 2, 3, 4, 999]);
    assertJsArrayEquals(arr4, [1, 2, 3, 4, 5]); // Original unchanged

    // Negative index - second to last
    const arr5 = [1, 2, 3, 4, 5];
    const result5 = arr5.with(-2, 888);
    assertJsArrayEquals(result5, [1, 2, 3, 888, 5]);
    assertJsArrayEquals(arr5, [1, 2, 3, 4, 5]); // Original unchanged

    // Single element array
    const singleArr = [42];
    const result6 = singleArr.with(0, 100);
    assertJsArrayEquals(result6, [100]);
    assertJsArrayEquals(singleArr, [42]); // Original unchanged

    // Array with undefined and null
    const arr6: any[] = [undefined, null, 0, false];
    const result7 = arr6.with(1, 'replaced');
    assertJsArrayEquals(result7, [undefined, 'replaced', 0, false]);
    assertJsArrayEquals(arr6, [undefined, null, 0, false]); // Original unchanged

    // Array with objects
    const obj1 = { x: 1 };
    const obj2 = { y: 2 };
    const arr7: any[] = [obj1, obj2];
    const newObj = { z: 3 };
    const result8 = arr7.with(0, newObj);
    assertJsArrayEquals(result8, [newObj, obj2]);
    assertJsArrayEquals(arr7, [obj1, obj2]); // Original unchanged

    // Array with nested arrays
    const arr8: any[] = [[1, 2], [3, 4], [5, 6]];
    const result9 = arr8.with(1, [99, 100]);
    assertJsArrayEquals(result9, [[1, 2], [99, 100], [5, 6]]);
    assertJsArrayEquals(arr8, [[1, 2], [3, 4], [5, 6]]); // Original unchanged

    // Mixed types array
    const arr9: any[] = [1, "hello", true, null, undefined];
    const result10 = arr9.with(2, false);
    assertJsArrayEquals(result10, [1, "hello", false, null, undefined]);
    assertJsArrayEquals(arr9, [1, "hello", true, null, undefined]); // Original unchanged

    // Replace with same value (no-op functionally)
    const arr10 = [1, 2, 3];
    const result11 = arr10.with(1, 2);
    assertJsArrayEquals(result11, [1, 2, 3]);
    assertJsArrayEquals(arr10, [1, 2, 3]); // Original unchanged

    // // Sparse array (commented out)
    // const sparseArr = [1, , 3, 4];
    // const result12 = sparseArr.with(1, 999);
    // assertJsArrayEquals(result12, [1, 999, 3, 4]);

    // // Array with NaN and Infinity (commented out)
    // const specialArr = [0/0, Infinity, -Infinity];
    // const result13 = specialArr.with(0, 42);
    // assertJsArrayEquals(result13, [42, Infinity, -Infinity]);

    // // Direct iterator access (commented out)
    // const arr11 = [1, 2, 3];
    // const result14 = arr11.with(1, 99);
    // const iterator = result14[Symbol.iterator]();
    // assertValueEquals(iterator.next().value, 1);
    // assertValueEquals(iterator.next().value, 99);
    // assertValueEquals(iterator.next().value, 3);
    // assertValueEquals(iterator.next().value, 4);
    // assertValueEquals(iterator.next().value, 5);
});

test("Array methods chain", () => {
    const arr = [10, 20, 30, 40, 50];

    assertValueEquals(arr.toReversed().at(-2), 20);

    const arr2 = [1, 2, 3];
    const arr3 = arr2.concat([4, 5, 6], [7, 8, 9]).slice(2, 7)
    assertJsArrayEquals(arr3, [3, 4, 5, 6, 7]);
});