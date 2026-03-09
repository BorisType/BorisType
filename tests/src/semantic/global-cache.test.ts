const key = "test";
const value = { hello: "world" };

globalCache.set(key, value);

const retrieved = globalCache.get(key);
botest.assertJsObjectEquals(retrieved, value, "Retrieved value should match the original value");

botest.assertOk();

export {};
