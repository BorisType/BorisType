import { assertJsArrayEquals, assertJsObjectEquals, test } from "./test";

test("Handle spread arrays", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [4, 5, 6];

    const test1 = [10, 11, 12, ...arr1, ...arr2]
    const test2 = [10, ...arr1, 11, ...arr2, 12]
    const test3 = [...arr2]
    // const test3 = [...aaa]

    assertJsArrayEquals(test1, [10, 11, 12, 1, 2, 3, 4, 5, 6], "Arrays should be combined");
    assertJsArrayEquals(test2, [10, 1, 2, 3, 11, 4, 5, 6, 12], "Arrays should be combined");
    assertJsArrayEquals(test3, [4, 5, 6], "Arrays should be combined");
});

test("Handle spread objects", () => {
    const obj1 = { keyV1: 'value1', keyV2: 'value2' }
    const obj2 = { keyV3: 'value3', keyV4: 'value4' }

    const testObject1 = { key1: 1, key2: 2, key3: 3, ...obj1, ...obj2 }
    const testObject2 = { key1: 1, ...obj1, key2: 2, ...obj2, key3: 3 }
    const testObject3 = { ...obj2 }
    // const testObject3 = { ...bbb }

    assertJsObjectEquals(testObject1, { key1: 1, key2: 2, key3: 3, keyV1: 'value1', keyV2: 'value2', keyV3: 'value3', keyV4: 'value4' }, "Objects should be combined");
    assertJsObjectEquals(testObject2, { key1: 1, keyV1: "value1", keyV2: "value2", key2: 2, keyV3: "value3", keyV4: "value4", key3: 3 }, "Objects should be combined");
    assertJsObjectEquals(testObject3, { keyV3: 'value3', keyV4: 'value4' }, "Objects should be combined");
});