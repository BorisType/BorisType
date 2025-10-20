import { assertJsArrayEquals, test } from "./test";

test("Handle variable declarations", () => {
    const arr = [1, 2, 3];
    const result = [];
    
    for (const item of arr) {
        result.push(item * 2);
    }

    assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");
});