// Integer separators
const sep1 = 1_000;
const sep2 = 1_000_000;
const sep3 = 1_234_567_890;
const sep4 = 100_200_300;
botest.assertValueEquals(sep1, 1000, "1_000 = 1000");
botest.assertValueEquals(sep2, 1000000, "1_000_000 = 1000000");
botest.assertValueEquals(sep3, 1234567890, "1_234_567_890 = 1234567890");
botest.assertValueEquals(sep4, 100200300, "100_200_300 = 100200300");

// Hex separators
const hexSep1 = 0xff_ff;
const hexSep2 = 0x00_ff;
botest.assertValueEquals(hexSep1, 65535, "0xFF_FF = 65535");
botest.assertValueEquals(hexSep2, 255, "0x00_FF = 255");

// Binary separators
const binSep1 = 0b1111_0000;
const binSep2 = 0b1010_0101;
botest.assertValueEquals(binSep1, 240, "0b1111_0000 = 240");
botest.assertValueEquals(binSep2, 165, "0b1010_0101 = 165");

// Octal separators
const octSep = 0o77_77;
botest.assertValueEquals(octSep, 4095, "0o77_77 = 4095");

// Float separators
const floatSep = 1_000.5;
botest.assertValueEquals(floatSep, 1000.5, "1_000.5 = 1000.5");

// Separator arithmetic
const sepSum = 1_000 + 2_000;
botest.assertValueEquals(sepSum, 3000, "1_000 + 2_000 = 3000");

botest.assertOk();
