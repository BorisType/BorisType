// Handle variable declarations", () => {
const arr1 = [1, 2, 3];
const result1 = arr1.map((x) => x * 2);

botest.assertJsArrayEquals(result1, [2, 4, 6], "Array should be doubled");

// Handle assignment expressions", () => {
const arr2 = [1, 2, 3];
let result2: number[];
result2 = arr2.map((x) => x * 2);

botest.assertJsArrayEquals(result2, [2, 4, 6], "Array should be doubled");

// Handle standalone expressions", () => {
const arr3 = [1, 2, 3];
const result3: number[] = [];
arr3.map((x) => {
  result3.push(x * 2);
  return x * 2;
});

botest.assertJsArrayEquals(result3, [2, 4, 6], "Array should be doubled");

// Handle call expressions within expression statements", () => {
function dummyFunc1(value: any) {
  return value;
}
const arr4 = [1, 2, 3];
const result4 = dummyFunc1(dummyFunc1(arr4.map((x) => x * 2)));

botest.assertJsArrayEquals(result4, [2, 4, 6], "Array should be doubled");

// Handle return statement", () => {
const arr5 = [1, 2, 3];
function getMapped(array: number[]) {
  return array.map((x) => x * 2).map((x) => x + 1);
}
const result5 = getMapped(arr5);

botest.assertJsArrayEquals(result5, [3, 5, 7], "Array should be doubled");

// Handle array elements", () => {
function dummyFunc2(value: any) {
  return value;
}

const arr6 = [1, 2, 3];
[arr6.map((x) => x * 2), arr6.map((x) => x + 1)];
const dummyResult6 = [arr6.map((x) => x * 2), arr6.map((x) => x + 1)];
const result6 = dummyFunc2(dummyFunc2([arr6.map((x) => x * 2), arr6.map((x) => x + 1)]));

botest.assertJsArrayEquals(result6[0], [2, 4, 6], undefined);
botest.assertJsArrayEquals(result6[1], [2, 3, 4], undefined);

// Handle object properties", () => {
function dummyFunc3(value: any) {
  return value;
}

const arr7 = [1, 2, 3];
// { key1: arr7.map((x) => x * 2), key2: arr7.map((x) => x + 1) };
const dummyResult7 = { key1: arr7.map((x) => x * 2), key2: arr7.map((x) => x + 1) };
const result7 = dummyFunc3(
  dummyFunc3({ key1: arr7.map((x) => x * 2), key2: arr7.map((x) => x + 1) }),
);

botest.assertJsArrayEquals(result7.key1, [2, 4, 6], undefined);
botest.assertJsArrayEquals(result7.key2, [2, 3, 4], undefined);

botest.assertOk();

export {};

// пока не работает
//     const arr = [1, 2, 3];

//     for (const v of [arr.map((x) => x * 2)]) {
//         alert(v);
//     }

//     // botest.assertJsArrayEquals(result, [2, 4, 6], "Array should be doubled");
