// Platform-specific integer text preservation, not JS Number equivalence.
// See ref/decisions/2026-03-30-numeric-literal-precision.md. Node rounds this
// literal beyond MAX_SAFE_INTEGER, so only this file is excluded from Node checks.
const largeDec = 7603264645902515852;
botest.assertValueEquals(largeDec + "", "7603264645902515852", "Large decimal literal");

botest.assertOk();
