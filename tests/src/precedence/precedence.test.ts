// Preserve parentheses: (a + b) * c
const a1 = 1;
const b1 = 2;
const c1 = 3;
const preserved = (a1 + b1) * c1;
botest.assertValueEquals(preserved, 9, "(a + b) * c should equal 9");

// Precedence: a + b * c → a + (b * c)
const a2 = 1;
const b2 = 2;
const c2 = 3;
const mulFirst = a2 + b2 * c2;
botest.assertValueEquals(mulFirst, 7, "a + b * c should equal 7 (multiplication first)");

// Logical: a && b || c → (a && b) || c
const t = true;
const f = false;
const orResult = (t && f) || t;
botest.assertValueEquals(orResult, true, "(true && false) || true should be true");

// Conditional with low-precedence in branches
const x = 1;
const y = 2;
const z = 3;
const ternary = x > 0 ? y + z : z - y;
botest.assertValueEquals(ternary, 5, "x > 0 ? y + z : z - y should be 5");

// Division/multiplication left-associativity: (a / b) * c
const a3 = 100;
const b3 = 2;
const c3 = 5;
const result = (a3 / b3) * c3;
botest.assertValueEquals(result, 250, "(100 / 2) * 5 should be 250");

botest.assertOk();

export {};
