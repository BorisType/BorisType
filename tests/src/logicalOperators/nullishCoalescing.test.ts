// =============================================================================
// ?? (nullish coalescing) — JS-compatible behavior
// null/undefined → return right; everything else → return left
// Key difference from ||: 0, "", false are NOT nullish
// =============================================================================

// Null / undefined → right
const nul: any = null;
botest.assertValueEquals(nul ?? "fallback", "fallback", "null returns right");

const und: any = undefined;
botest.assertValueEquals(und ?? "fallback", "fallback", "undefined returns right");

// Falsy but NOT nullish → left (key difference from ||)
const zero: any = 0;
botest.assertValueEquals(zero ?? 99, 0, "zero returns left (not nullish)");

const empty: any = "";
botest.assertValueEquals(empty ?? "fallback", "", "empty string returns left (not nullish)");

const bFalse: any = false;
botest.assertValueEquals(bFalse ?? "fallback", false, "false returns left (not nullish)");

// Truthy → left
const str: any = "hello";
botest.assertValueEquals(str ?? "fallback", "hello", "truthy string returns left");

const num: any = 42;
botest.assertValueEquals(num ?? 0, 42, "truthy number returns left");

// =============================================================================
// Chained ??
// =============================================================================

const cA: any = null;
const cB: any = undefined;
botest.assertValueEquals(cA ?? cB ?? "found", "found", "chained: both nullish returns last");

const cC: any = null;
const cD: any = 0;
botest.assertValueEquals(cC ?? cD ?? "unused", 0, "chained: stops at 0 (not nullish)");

const cE: any = null;
const cF: any = "";
botest.assertValueEquals(cE ?? cF ?? "unused", "", "chained: stops at empty string (not nullish)");

// =============================================================================
// ?? short-circuit evaluation
// =============================================================================

let sideEffect = "";

function track(value: any, label: string): any {
  sideEffect = sideEffect + label;
  return value;
}

// Non-nullish left — right NOT evaluated
sideEffect = "";
const sc1 = track("exists", "L") ?? track("unused", "R");
botest.assertValueEquals(sc1, "exists", "non-nullish left returns left");
botest.assertValueEquals(sideEffect, "L", "right not evaluated when left non-nullish");

// 0 is non-nullish — right NOT evaluated
sideEffect = "";
const sc2 = track(0, "L") ?? track("unused", "R");
botest.assertValueEquals(sc2, 0, "zero is non-nullish");
botest.assertValueEquals(sideEffect, "L", "right not evaluated when left is 0");

// null left — right IS evaluated
sideEffect = "";
const sc3 = track(null, "L") ?? track("fallback", "R");
botest.assertValueEquals(sc3, "fallback", "null triggers right evaluation");
botest.assertValueEquals(sideEffect, "LR", "both sides evaluated when left null");

// undefined left — right IS evaluated
sideEffect = "";
const sc4 = track(undefined, "L") ?? track("fallback", "R");
botest.assertValueEquals(sc4, "fallback", "undefined triggers right evaluation");
botest.assertValueEquals(sideEffect, "LR", "both sides evaluated when left undefined");

// =============================================================================
// ?? in expression contexts
// =============================================================================

const nulVal: any = null;
botest.assertValueEquals(
  "prefix:" + (nulVal ?? "default"),
  "prefix:default",
  "?? inside string concat",
);

const zeroVal: any = 0;
botest.assertValueEquals("count:" + (zeroVal ?? 99), "count:0", "?? preserves 0 in concat");

function identity(x: any): any {
  return x;
}
const undVal: any = undefined;
botest.assertValueEquals(identity(undVal ?? 42), 42, "?? as function argument");

botest.assertOk();

export {};
