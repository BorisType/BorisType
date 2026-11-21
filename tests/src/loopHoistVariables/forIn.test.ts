// for-in loop with const block-scoped variable
function doubleItems(): number[] {
  const obj = { a: 1, b: 2, c: 3 };
  const result = [];

  for (const v in obj) {
    // @ts-ignore
    const doubled = obj[v] * 2;
    result.push(doubled);
  }

  return result;
}

botest.assertJsArrayEquals(doubleItems(), [2, 4, 6], "Array should be doubled");

botest.assertOk();

export {};
