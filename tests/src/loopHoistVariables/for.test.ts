// Simple for loop with const block-scoped variable
const arr = [1, 2, 3];
const result = [];

for (let i = 0; i < arr.length; i++) {
  const doubled = arr[i] * 2;
  result.push(doubled);
}

botest.assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");

botest.assertOk();

export {};
