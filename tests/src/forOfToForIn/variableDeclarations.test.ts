// for-of loop with variable declarations
const arr = [1, 2, 3];
const result = [];

for (const item of arr) {
    result.push(item * 2);
}

botest.assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");


botest.assertOk();

export {};
