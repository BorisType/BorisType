// import { assertValueEquals, test } from "./test";

// test("Handle prop sematic 1", () => {
//     const obj = {
//         prop1: {
//             prop2: {
//                 prop3: 42
//             }
//         }
//     };

//     assertValueEquals(obj.prop1.prop2.prop3, 42);
// });

// test("Handle prop sematic 2", () => {
//     type Prop2 = {
//         prop3: number;
//         propN?: number;
//     };

//     const prop2: Prop2 = {
//         prop3: 42
//     };

//     const obj = {
//         prop1: {
//             prop2: prop2
//         }
//     };

//     assertValueEquals(obj.prop1.prop2.propN, undefined);
// });

// test("Handle prop sematic with optional chaining get value", () => {
//     type Prop2 = {
//         prop3: number;
//         propN?: number;
//     };

//     type Prop1 = {
//         prop2?: Prop2;
//     };


//     const prop2: Prop2 = {
//         prop3: 42
//     };

//     const prop1: Prop1 = {
//         prop2: prop2
//     };

//     const obj = {
//         prop1: prop1
//     };

//     const myValue = obj.prop1.prop2?.prop3;

//     assertValueEquals(myValue, 42);
// });


// test("Handle prop sematic with optional chaining get undefined", () => {
//     type Prop2 = {
//         prop3: number;
//         propN?: number;
//     };

//     type Prop1 = {
//         prop2?: Prop2;
//     };


//     const prop2: Prop2 = {
//         prop3: 42
//     };

//     const prop1: Prop1 = {
//     };

//     const obj = {
//         prop1: prop1
//     };

//     const myValue = obj.prop1.prop2?.prop3;

//     assertValueEquals(myValue, undefined);
// });

// test("Testtest", () => {
//     const arr = [1, 2, 3];
//     const str = "str";


//     assertValueEquals(arr.length, 3);
//     // assertValueEquals(str.length, 3);

//     // assertValueEquals(GetOptObjectProperty(arr, "length"), 3);
//     // assertValueEquals(GetOptObjectProperty(str, "length"), 3);
// });


// test("Optional chaining with deeply nested undefined", () => {
//     const obj = {
//         a: {
//             b: undefined
//         }
//     };
//     const value = obj.a.b?.c;
//     assertValueEquals(value, undefined);
// });

// test("Optional chaining with array element", () => {
//     const arr = [{ x: 1 }, undefined, { x: 3 }];
//     const value1 = arr[0]?.x;
//     const value2 = arr[1]?.x;
//     const value3 = arr[2]?.x;
//     assertValueEquals(value1, 1);
//     assertValueEquals(value2, undefined);
//     assertValueEquals(value3, 3);
// });

// test("Optional chaining with multiple missing properties", () => {
//     const obj: any = {};
//     const value = obj.a?.b?.c?.d;
//     assertValueEquals(value, undefined);
// });

// test("Optional chaining with null value", () => {
//     const obj = { a: null };
//     const value = obj.a?.b;
//     assertValueEquals(value, undefined);
// });

// test("Optional chaining with property that is 0", () => {
//     const obj = { a: { b: 0 } };
//     const value = obj.a?.b;
//     assertValueEquals(value, 0);
// });

// test("Optional chaining with property that is false", () => {
//     const obj = { a: { b: false } };
//     const value = obj.a?.b;
//     assertValueEquals(value, false);
// });

// test("Optional chaining with property that is empty string", () => {
//     const obj = { a: { b: "" } };
//     const value = obj.a?.b;
//     assertValueEquals(value, "");
// });