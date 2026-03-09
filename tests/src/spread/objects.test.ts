// Spread operator with objects
const obj1 = { keyV1: "value1", keyV2: "value2" };
const obj2 = { keyV3: "value3", keyV4: "value4" };

const testObject1 = { key1: 1, key2: 2, key3: 3, ...obj1, ...obj2 };
const testObject2 = { key1: 1, ...obj1, key2: 2, ...obj2, key3: 3 };
const testObject3 = { ...obj2 };

botest.assertJsObjectEquals(
  testObject1,
  { key1: 1, key2: 2, key3: 3, keyV1: "value1", keyV2: "value2", keyV3: "value3", keyV4: "value4" },
  "Objects should be combined",
);
botest.assertJsObjectEquals(
  testObject2,
  { key1: 1, keyV1: "value1", keyV2: "value2", key2: 2, keyV3: "value3", keyV4: "value4", key3: 3 },
  "Objects should be combined",
);
botest.assertJsObjectEquals(
  testObject3,
  { keyV3: "value3", keyV4: "value4" },
  "Objects should be combined",
);

botest.assertOk();

export {};
