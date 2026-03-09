// Optional chaining with deeply nested undefined
const obj = {
  a: {
    b: undefined,
  },
};

// @ts-ignore
const value = obj.a.b?.c;

botest.assertValueEquals(value, undefined, "chaining on undefined should return undefined");

botest.assertOk();

export {};
