// Zero variants
const z1 = 0;
const z2 = 0.0;
const z3 = 0x0;
const z4 = 0o0;
const z5 = 0b0;
botest.assertValueEquals(z1, 0, "0 = 0");
botest.assertValueEquals(z2, 0, "0.0 = 0");
botest.assertValueEquals(z3, 0, "0x0 = 0");
botest.assertValueEquals(z4, 0, "0o0 = 0");
botest.assertValueEquals(z5, 0, "0b0 = 0");

// Max safe integer and nearby
const maxSafe = 9007199254740991;
botest.assertValueEquals(maxSafe, 9007199254740991, "MAX_SAFE_INTEGER exact");

// Large integers within safe range
const large1 = 1000000000000;
const large2 = 9999999999;
const large3 = 4294967295;
botest.assertValueEquals(large1, 1000000000000, "1 trillion");
botest.assertValueEquals(large2, 9999999999, "10 billion - 1");
botest.assertValueEquals(large3, 4294967295, "UINT32_MAX");

// Single digit
const d0 = 0;
const d1 = 1;
const d2 = 2;
const d9 = 9;
botest.assertValueEquals(d0, 0, "digit 0");
botest.assertValueEquals(d1, 1, "digit 1");
botest.assertValueEquals(d2, 2, "digit 2");
botest.assertValueEquals(d9, 9, "digit 9");

// Very large hex within safe range
const largeHex = 0x1fffffffffffff;
const largeDec = 7603264645902515852;
botest.assertValueEquals(largeHex, 9007199254740991, "0x1FFFFFFFFFFFFF = MAX_SAFE_INTEGER");
botest.assertValueEquals(largeDec + "", "7603264645902515852", "Large decimal literal");

botest.assertOk();
