const array = [
    [0, 1],
    [2, 3],
    [4, 5],
];

const result = array.reduceRight((accumulator, currentValue) => ArrayUnion(accumulator, currentValue), []);
botest.assertJsArrayEquals(result, [4, 5, 2, 3, 0, 1], undefined);


botest.assertOk();

export { };