import { assertJsArrayEquals, assertValueEquals, test } from "./test";


test("Handle variable declarations", () => {
    const arr = [1, 2, 3];
    // const result = arr.toReversed().map((x) => x * 2);
    const result = arr.map((x) => x * 2);

    assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");
});

test("Handle assignment expressions", () => {
    const arr = [1, 2, 3];
    let result: number[];
    result = arr.map((x) => x * 2);

    assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");
});

test("Handle standalone expressions", () => {
    const arr = [1, 2, 3];
    const result: number[] = [];
    arr.map((x) => {
        result.push(x * 2);
        return x * 2;
    });

    assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");
});

test("Handle call expressions within expression statements", () => {
    function dummyFunc(value: any) {
        return value;
    }

    const arr = [1, 2, 3];
    const result = dummyFunc(dummyFunc(arr.map((x) => x * 2)));

    assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");
});

test("Handle simple chains", () => {
    const arr = [1, 2, 3];
    const result = arr.map((x) => x * 2).map((x) => x + 1);

    assertJsArrayEquals(result, [3, 5, 7], "Array should be doubled");
});

test("Handle chains with ending .length", () => {
    const arr = [1, 2, 3];
    const result = arr.map((x) => x * 2).map((x) => x + 1).length;

    assertValueEquals(result, 3, "Length must be 3");
});

test("Handle return statement", () => {
    const arr = [1, 2, 3];

    function getMapped(array: number[]) {
        return array.map((x) => x * 2).map((x) => x + 1);
    }

    const result = getMapped(arr);

    assertJsArrayEquals(result, [3, 5, 7], "Array should be doubled");
});

// Array elements: Handle map chains in array literals, e.g., [arr.map(...), ...].
test("Handle array elements", () => {
    function dummyFunc(value: any) {
        return value;
    }

    const arr = [1, 2, 3];
    [arr.map((x) => x * 2), arr.map((x) => x + 1)];
    const dummyResult = [arr.map((x) => x * 2), arr.map((x) => x + 1)];
    const result = dummyFunc(dummyFunc([arr.map((x) => x * 2), arr.map((x) => x + 1)]));


    assertJsArrayEquals(result[0], [2, 4, 6]);
    assertJsArrayEquals(result[1], [2, 3, 4]);
});

// Object properties: Process map chains in object literals, e.g., { key: arr.map(...) }.
test("Handle object properties", () => {
    function dummyFunc(value: any) {
        return value;
    }
    
    const arr = [1, 2, 3];
    // { key1: arr.map((x) => x * 2), key2: arr.map((x) => x + 1) };
    const dummyResult = { key1: arr.map((x) => x * 2), key2: arr.map((x) => x + 1) };
    const result = dummyFunc(dummyFunc({ key1: arr.map((x) => x * 2), key2: arr.map((x) => x + 1) }));

    assertJsArrayEquals(result.key1, [2, 4, 6]);
    assertJsArrayEquals(result.key2, [2, 3, 4]);
});

test("Handle mixed calls", () => {
    const arr = [1, 2, 3];
    const result = arr.map((x) => x + 1).filter((x) => x > 2).map((x) => x * 1);

    assertJsArrayEquals(result, [3, 4]);
});

test("Handle 'every' calls", () => {
    const arr = [1, 2, 3];
    const result1 = arr.every((x) => x > 1);
    const result2 = arr.every((x) => x > 0);

    assertValueEquals(result1, false);
    assertValueEquals(result2, true);
});

test("Handle 'filter' calls", () => {
    const arr = [1, 2, 3];
    const result = arr.filter((x) => x > 1);

    assertJsArrayEquals(result, [2, 3]);
});

test("Handle 'find' calls", () => {
    const arr = [1, 2, 3];
    const result1 = arr.find((x) => x > 1);
    const result2 = arr.find((x) => x === 4);

    assertValueEquals(result1, 2);
    assertValueEquals(result2, undefined);
});

test("Handle 'findIndex' calls", () => {
    const arr = [1, 2, 3];
    const result1 = arr.findIndex((x) => x > 1);
    const result2 = arr.findIndex((x) => x === 4);

    assertValueEquals(result1, 1);
    assertValueEquals(result2, -1);
});

test("Handle 'findLast' calls", () => {
    const arr = [1, 2, 3];
    const result1 = arr.findLast((x) => x > 1);
    const result2 = arr.findLast((x) => x === 4);

    assertValueEquals(result1, 3);
    assertValueEquals(result2, undefined);
});

test("Handle 'findLastIndex' calls", () => {
    const arr = [1, 2, 3];
    const result1 = arr.findLastIndex((x) => x > 1);
    const result2 = arr.findLastIndex((x) => x === 4);

    assertValueEquals(result1, 2);
    assertValueEquals(result2, -1);
});

test("Handle 'flatMap' calls", () => {
    const arr = [1, 2, 3];
    const result1 = arr.flatMap((x) => [x, x * 2]);
    const result2 = arr.flatMap((x) => (x === 2 ? [x, x * 2] : []));

    assertJsArrayEquals(result1, [1, 2, 2, 4, 3, 6]);
    assertJsArrayEquals(result2, [2, 4]);
});

test("Handle 'forEach' calls", () => {
    const arr = [1, 2, 3];
    const result: number[] = [];

    arr.forEach((x) => {
        result.push(x * 2);
    });

    assertJsArrayEquals(result, [2, 4, 6]);
});

test("Handle 'map' calls", () => {
    const arr = [1, 2, 3];
    const result = arr.map((x) => x + 1);

    assertJsArrayEquals(result, [2, 3, 4]);
});

test("Handle 'reduce' calls", () => {
    const arr = [1, 2, 3];
    const result1 = arr.reduce((acc, x) => acc + x, 0);

    assertValueEquals(result1, 6);
});

test("Handle 'reduceRight' calls", () => {
    const array = [
        [0, 1],
        [2, 3],
        [4, 5],
    ];

    const result = array.reduceRight((accumulator, currentValue) => ArrayUnion(accumulator, currentValue), []);

    // console.log(result);
    // Expected output: Array [4, 5, 2, 3, 0, 1]
    assertJsArrayEquals(result, [4, 5, 2, 3, 0, 1]);
});

test("Handle 'some' calls", () => {
    const arr = [1, 2, 3];
    const result1 = arr.some((x) => x > 1);
    const result2 = arr.some((x) => x === 4);

    assertValueEquals(result1, true);
    assertValueEquals(result2, false);
});


test("Handle calls on not simple array", () => {
    const arr = [1, 2, 3];
    const obj = {
        array: arr
    }

    const result = obj.array.map((x) => x + 1);

    assertJsArrayEquals(result, [2, 3, 4]);
});

// доделать этот кейс
// test("Handle variable declarations", () => {
//     const arr = [1, 2, 3];
    
//     for (const v of [arr.map((x) => x * 2)]) {
//         alert(v);
//     }

//     // assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");
// });