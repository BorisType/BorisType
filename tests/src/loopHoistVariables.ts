import { assertJsArrayEquals, test } from "./test";


test("Handle simple for-of loop", () => {
    const arr = [1, 2, 3];
    const result = [];

    for (const v of arr) {
        const doubled = v * 2;
        result.push(doubled);
    }

    assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");
});


test("Handle simple for-in loop", () => {
    const obj = { "a": 1, "b": 2, "c": 3 };
    const result = [];

    for (const v in obj) {
        const doubled = obj[v] * 2;
        result.push(doubled);
    }

    assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");
});

test("Handle deep inner loops", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [4, 5, 6];
    const result = [];

    for (const v1 of arr1) {
        const test = v1 * 2;

        if (v1 > 2) {
            for (const v2 of arr2) {
                const doubled = (test + v2) * 2;
                result.push(doubled);
            }
        }
    }

    // LogEvent("debug", EncodeJson(result));
    assertJsArrayEquals(result, [20, 22, 24], "Array should be doubled");
});