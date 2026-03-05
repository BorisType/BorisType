// Destructuring test
const inputObj = { a: 1, b: 2, c: 3 };
const { a, b } = inputObj;

const inputArr = [10, 20, 30];
const [first, second] = inputArr;

const { x, y, ...rest } = { x: 1, y: 2, z: 3 };
const [p, q, ...tail] = [1, 2, 3, 4];

// Default values
const { m = 100, n = 200 } = { m: 1 };
const [head = 0, ...rest2] = [];

export {};
