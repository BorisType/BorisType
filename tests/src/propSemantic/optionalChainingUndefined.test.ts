// Optional chaining - get undefined
type Prop2 = {
  prop3: number;
  propN?: number;
};

type Prop1 = {
  prop2?: Prop2;
};

const prop2: Prop2 = {
  prop3: 42,
};

const prop1: Prop1 = {};

const obj = {
  prop1: prop1,
};

const myValue = obj.prop1.prop2?.prop3;

botest.assertValueEquals(myValue, undefined, "optional chaining should return undefined when property is missing");

botest.assertOk();

export {};
