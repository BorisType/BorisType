// Basic exponential notation
const e1 = 1;
const e2 = 1e1;
const e3 = 1e3;
const e4 = 1e10;
const e5 = 5e2;
botest.assertValueEquals(e1, 1, "1e0 = 1");
botest.assertValueEquals(e2, 10, "1e1 = 10");
botest.assertValueEquals(e3, 1000, "1e3 = 1000");
botest.assertValueEquals(e4, 10000000000, "1e10 = 10000000000");
botest.assertValueEquals(e5, 500, "5e2 = 500");

// Uppercase E
const eUp1 = 1e3;
const eUp2 = 5e2;
botest.assertValueEquals(eUp1, 1000, "1E3 = 1000");
botest.assertValueEquals(eUp2, 500, "5E2 = 500");

// Negative exponents
const eNeg1 = 1e-1;
const eNeg2 = 1e-3;
const eNeg3 = 5e-2;
botest.assertValueEquals(eNeg1, 0.1, "1e-1 = 0.1");
botest.assertValueEquals(eNeg2, 0.001, "1e-3 = 0.001");
botest.assertValueEquals(eNeg3, 0.05, "5e-2 = 0.05");

// Float with exponent
const fe1 = 1.5e3;
const fe2 = 2.5e2;
botest.assertValueEquals(fe1, 1500, "1.5e3 = 1500");
botest.assertValueEquals(fe2, 250, "2.5e2 = 250");

// Exponent in arithmetic
const expSum = 1e3 + 2e3;
botest.assertValueEquals(expSum, 3000, "1e3 + 2e3 = 3000");

botest.assertOk();
