const value = 5;

const template = `VALUE ${value > 0 ? value : 0} END`;
botest.assertValueEquals(template, "VALUE 5 END", "extract a conditional inside a template literal");

const concatenation = "VALUE " + (value > 0 ? value : 0) + " END";
botest.assertValueEquals(concatenation, "VALUE 5 END", "extract a conditional inside string concatenation");

const addition = (value > 0 ? value : 0) + 100;
botest.assertValueEquals(addition, 105, "extract a conditional inside numeric addition");

botest.assertOk();

export {};
