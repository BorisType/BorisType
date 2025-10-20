import { assertJsArrayEquals, assertValueEquals, test } from "./test";

test("Handle object destructuring", () => {
  const input = { a: 1, b: 2, c: 3 };
  const { a, b } = input;

  assertValueEquals(a, 1);
  assertValueEquals(b, 2);
});

test("Handle object destructuring with rest", () => {
  const input = { a: 1, b: 2, c: 3 };
  const { a, b, ...rest } = input;

  assertValueEquals(a, 1);
  assertValueEquals(b, 2);
  assertValueEquals(rest.c, 3);
});

test("Handle array destructuring", () => {
  const input = [10, 20, 30];
  const [first, second] = input;

  assertValueEquals(first, 10);
  assertValueEquals(second, 20);
});

test("Handle array destructuring with rest", () => {
  const input = [10, 20, 30];
  const [first, second, ...rest] = input;

  assertValueEquals(first, 10);
  assertValueEquals(second, 20);
  assertValueEquals(rest[0], 30);
});

// test("Handle array destructuring with loops", () => {
//   const arrarr = [[10, 20], [30, 40]];
//   const result = [];

//   for (const [key, value] of arrarr) {
//     const sum = key + value;
//     result.push(sum);
//   }

//   assertJsArrayEquals(result, [30, 70]);
// });

