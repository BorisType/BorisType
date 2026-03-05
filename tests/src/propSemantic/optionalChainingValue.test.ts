// Optional chaining - get value
type Prop2 = {
    prop3: number;
    propN?: number;
};

type Prop1 = {
    prop2?: Prop2;
};

const prop2: Prop2 = {
    prop3: 42
};

const prop1: Prop1 = {
    prop2: prop2
};

const obj = {
    prop1: prop1
};

const myValue = obj.prop1.prop2?.prop3;

botest.assertValueEquals(myValue, 42, "optional chaining should return value");


botest.assertOk();

export {};
