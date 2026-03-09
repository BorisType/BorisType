// Property semantic with undefined optional property
type Prop2 = {
  prop3: number;
  propN?: number;
};

const prop2: Prop2 = {
  prop3: 42,
};

const obj = {
  prop1: {
    prop2: prop2,
  },
};

botest.assertValueEquals(obj.prop1.prop2.propN, undefined, "optional property should be undefined");

botest.assertOk();

export {};
