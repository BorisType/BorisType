// Optional chaining with array element
const arr = [{ x: 1 }, undefined, { x: 3 }];

const value1 = arr[0]?.x;
const value2 = arr[1]?.x;
const value3 = arr[2]?.x;

botest.assertValueEquals(value1, 1, "first element should have x=1");
botest.assertValueEquals(value2, undefined, "second element is undefined");
botest.assertValueEquals(value3, 3, "third element should have x=3");

botest.assertOk();

export {};
