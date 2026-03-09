// Array destructuring with loops
// TODO: пока не работает

const arrarr = [
  [10, 20],
  [30, 40],
];
const result = [];

for (const [key, value] of arrarr) {
  const sum = key + value;
  result.push(sum);
}

botest.assertJsArrayEquals(result, [30, 70], "sums should be [30, 70]");

botest.assertOk();

export {};
