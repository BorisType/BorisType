// Optional chaining with multiple missing properties
const obj: any = {};

const value = obj.a?.b?.c?.d;

botest.assertValueEquals(value, undefined, "chaining through missing properties should return undefined");


botest.assertOk();

export {};
