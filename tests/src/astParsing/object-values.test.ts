const aaa = 1;
const bbb = 2;

const object = {
  cond: aaa > bbb ? "greater" : "lesser",
  values: aaa + bbb,
};

const condValue = aaa > bbb ? "greater" : "lesser";
const valuesValue = aaa + bbb;

botest.assertValueEquals(object.cond, "lesser", "Ternary operator should correctly evaluate the condition");
botest.assertValueEquals(object.values, 3, "Object property should correctly compute the sum of aaa and bbb");

botest.assertValueEquals(condValue, "lesser", "Ternary operator should correctly evaluate the condition when assigned to a variable");
botest.assertValueEquals(valuesValue, 3, "Variable should correctly compute the sum of aaa and bbb");

botest.assertOk();

export {};
