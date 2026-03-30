// Hexadecimal → decimal
const hex1 = 0xff;
const hex2 = 0x0;
const hex3 = 0x1;
const hex4 = 0x10;
const hex5 = 0xcafe;
const hex6 = 0xdead;
const hex7 = 0xffffffff;
botest.assertValueEquals(hex1, 255, "0xFF = 255");
botest.assertValueEquals(hex2, 0, "0x0 = 0");
botest.assertValueEquals(hex3, 1, "0x1 = 1");
botest.assertValueEquals(hex4, 16, "0x10 = 16");
botest.assertValueEquals(hex5, 51966, "0xCAFE = 51966");
botest.assertValueEquals(hex6, 57005, "0xDEAD = 57005");
botest.assertValueEquals(hex7, 4294967295, "0xFFFFFFFF = 4294967295");

// Lowercase hex
const hexLow = 0xff;
botest.assertValueEquals(hexLow, 255, "0xff lowercase = 255");

// Octal → decimal
const oct1 = 0o0;
const oct2 = 0o7;
const oct3 = 0o10;
const oct4 = 0o77;
const oct5 = 0o755;
const oct6 = 0o777;
botest.assertValueEquals(oct1, 0, "0o0 = 0");
botest.assertValueEquals(oct2, 7, "0o7 = 7");
botest.assertValueEquals(oct3, 8, "0o10 = 8");
botest.assertValueEquals(oct4, 63, "0o77 = 63");
botest.assertValueEquals(oct5, 493, "0o755 = 493");
botest.assertValueEquals(oct6, 511, "0o777 = 511");

// Binary → decimal
const bin1 = 0b0;
const bin2 = 0b1;
const bin3 = 0b10;
const bin4 = 0b1010;
const bin5 = 0b11111111;
const bin6 = 0b10000000;
botest.assertValueEquals(bin1, 0, "0b0 = 0");
botest.assertValueEquals(bin2, 1, "0b1 = 1");
botest.assertValueEquals(bin3, 2, "0b10 = 2");
botest.assertValueEquals(bin4, 10, "0b1010 = 10");
botest.assertValueEquals(bin5, 255, "0b11111111 = 255");
botest.assertValueEquals(bin6, 128, "0b10000000 = 128");

// Hex in arithmetic
const hexSum = 0x10 + 0x20;
botest.assertValueEquals(hexSum, 48, "0x10 + 0x20 = 48");

// Binary in arithmetic
const binSum = 0b100 + 0b010;
botest.assertValueEquals(binSum, 6, "0b100 + 0b010 = 6");

botest.assertOk();
