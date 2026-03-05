const arr1 = [1, 2, 3];
const arr2 = [4, 5, 6];

const testArr0 = [...arr1, ...arr2, ...arr1];
const testArr1 = [10, 11, 12, ...arr1, ...arr2];
const testArr2 = [10, ...arr1, 11, ...arr2, 12];
const testArr3 = [...arr2];


const obj1 = { keyV1: 'value1', keyV2: 'value2' };
const obj2 = { keyV3: 'value3', keyV4: 'value4' };

const testObj0 = { ...obj1, ...obj2, ...obj1 };
const testObj1 = { key1: 1, key2: 2, key3: 3, ...obj1, ...obj2 };
const testObj2 = { key1: 1, ...obj1, key2: 2, ...obj2, key3: 3 };
const testObj3 = { ...obj2 };


export {}