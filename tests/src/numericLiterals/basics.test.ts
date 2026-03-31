// Integer literals
const int1 = 0;
const int2 = 1;
const int3 = 42;
const int4 = 999999;
botest.assertValueEquals(int1, 0, "zero literal");
botest.assertValueEquals(int2, 1, "one literal");
botest.assertValueEquals(int3, 42, "simple integer 42");
botest.assertValueEquals(int4, 999999, "six digit integer");

// Float literals
const f1 = 3.14;
const f2 = 0.5;
const f3 = 100.0;
const f4 = 0.001;
const f5 = 123.456789;
botest.assertValueEquals(f1, 3.14, "pi-like float");
botest.assertValueEquals(f2, 0.5, "half");
botest.assertValueEquals(f3, 100.0, "float with .0");
botest.assertValueEquals(f4, 0.001, "small float");
botest.assertValueEquals(f5, 123.456789, "multi-decimal float");

// Arithmetic with literals (verify value, not just output)
const sum = 10 + 32;
const product = 7 * 6;
const diff = 100 - 58;
botest.assertValueEquals(sum, 42, "10 + 32 = 42");
botest.assertValueEquals(product, 42, "7 * 6 = 42");
botest.assertValueEquals(diff, 42, "100 - 58 = 42");

botest.assertOk();
