// Nested property access
const obj = {
    prop1: {
        prop2: {
            prop3: 42
        }
    }
};

botest.assertValueEquals(obj.prop1.prop2.prop3, 42, "should access nested property");


botest.assertOk();

export {};
