// for-of loop with const block-scoped variable
function doubleItems(): number[] {
  const arr = [1, 2, 3];
  const result = [];

  for (const v of arr) {
    const doubled = v * 2;
    result.push(doubled);
  }

  return result;
}

botest.assertJsArrayEquals(doubleItems(), [2, 4, 6], "Array should be doubled");

botest.assertOk();

export {};
