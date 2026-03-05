const arr = [1, 2, 3];
const result: number[] = [];
arr.forEach((x) => {
    result.push(x * 2);
});
botest.assertJsArrayEquals(result, [2, 4, 6], undefined);


botest.assertOk();

export { };