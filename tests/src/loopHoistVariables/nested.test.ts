// Deep inner loops with multiple block-scoped variables
function doubleNestedItems(): number[] {
  const arr1 = [1, 2, 3];
  const arr2 = [4, 5, 6];
  const result = [];

  for (const v1 of arr1) {
    const test = v1 * 2;

    if (v1 > 2) {
      for (const v2 of arr2) {
        const doubled = (test + v2) * 2;
        let counter = 0;

        while (counter < 2) {
          result.push(doubled);
          counter++;
        }
      }
    }
  }

  return result;
}

botest.assertJsArrayEquals(doubleNestedItems(), [20, 20, 22, 22, 24, 24], "Nested loops should produce correct result");

botest.assertOk();

export {};
