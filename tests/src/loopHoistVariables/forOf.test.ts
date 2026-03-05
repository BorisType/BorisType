// for-of loop with const block-scoped variable
const arr = [1, 2, 3];
const result = [];

for (const v of arr) {
    const doubled = v * 2;
    result.push(doubled);
}

botest.assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");


botest.assertOk();

export {};
