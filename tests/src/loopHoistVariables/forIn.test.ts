// for-in loop with const block-scoped variable
const obj = { a: 1, b: 2, c: 3 };
const result = [];

for (const v in obj) {
  // @ts-ignore
  const doubled = obj[v] * 2;
  result.push(doubled);
}

botest.assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");

botest.assertOk();

export {};
