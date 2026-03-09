// Optional chaining with method call
const obj = {
  // getValue: () => 42
  getValue() {
    return 42;
  },
};

// @ts-ignore
const value = obj.getValue?.();

botest.assertValueEquals(value, 42, "optional method call should return 42");

botest.assertOk();

export {};
