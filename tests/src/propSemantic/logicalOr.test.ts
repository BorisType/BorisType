// =============================================================================
// Value return semantics (JS-compatible || behavior)
// =============================================================================

// String || fallback
const strTruthy: any = "hello";
const str1 = strTruthy || "default";
botest.assertValueEquals(str1, "hello", "truthy string returns left operand");

const strFalsy: any = "";
const str2 = strFalsy || "default";
botest.assertValueEquals(str2, "default", "empty string returns right operand");

// Number || fallback
const numTruthy: any = 42;
const num1 = numTruthy || 0;
botest.assertValueEquals(num1, 42, "truthy number returns left operand");

const numFalsy: any = 0;
const num2 = numFalsy || 5;
botest.assertValueEquals(num2, 5, "zero returns right operand");

// Null/undefined || fallback
const n1: any = null;
const nul1 = n1 || "fallback";
botest.assertValueEquals(nul1, "fallback", "null returns right operand");

const u1: any = undefined;
const und1 = u1 || "fallback";
botest.assertValueEquals(und1, "fallback", "undefined returns right operand");

// Boolean || fallback
const boolFalsy: any = false;
const bool1 = boolFalsy || "fallback";
botest.assertValueEquals(bool1, "fallback", "false returns right operand");

const boolTruthy: any = true;
const bool2 = boolTruthy || "fallback";
botest.assertValueEquals(bool2, true, "true returns left operand");

// =============================================================================
// Short-circuit evaluation
// =============================================================================

let sideEffect = "";

function track(value: any, label: string): any {
  sideEffect = sideEffect + label;
  return value;
}

// When left is truthy, right should NOT be evaluated
sideEffect = "";
const sc1 = track("truthy", "L") || track("unused", "R");
botest.assertValueEquals(sc1, "truthy", "short-circuit: truthy left returns left");
botest.assertValueEquals(sideEffect, "L", "short-circuit: right not evaluated when left truthy");

// When left is falsy, right SHOULD be evaluated
sideEffect = "";
const sc2 = track("", "L") || track("right", "R");
botest.assertValueEquals(sc2, "right", "short-circuit: falsy left returns right");
botest.assertValueEquals(sideEffect, "LR", "short-circuit: both sides evaluated when left falsy");

// =============================================================================
// Chained ||
// =============================================================================

const cA: any = "";
const cB: any = 0;
const chain1 = cA || cB || "found";
botest.assertValueEquals(chain1, "found", "chained: first truthy wins");

const cC: any = "";
const chain2 = cC || "second" || "third";
botest.assertValueEquals(chain2, "second", "chained: stops at first truthy");

const cD: any = null;
const cE: any = undefined;
const cF: any = 0;
const cG: any = false;
const chain3 = cD || cE || cF || cG || "last";
botest.assertValueEquals(chain3, "last", "chained: all falsy until last");

// =============================================================================
// || in expressions
// =============================================================================

const emptyStr: any = "";
const inConcat = "prefix:" + (emptyStr || "default");
botest.assertValueEquals(inConcat, "prefix:default", "|| inside string concat");

const emptyStr2: any = "";
const inTernary = (emptyStr2 || "val") === "val" ? "yes" : "no";
botest.assertValueEquals(inTernary, "yes", "|| result used in ternary condition");

botest.assertOk();

export {};
