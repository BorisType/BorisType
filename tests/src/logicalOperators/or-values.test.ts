// =============================================================================
// || value return semantics — JS-compatible behavior
// =============================================================================

// String
const strTruthy: any = "hello";
botest.assertValueEquals(strTruthy || "default", "hello", "truthy string returns left");

const strFalsy: any = "";
botest.assertValueEquals(strFalsy || "default", "default", "empty string returns right");

// Number
const numTruthy: any = 42;
botest.assertValueEquals(numTruthy || 0, 42, "truthy number returns left");

const numFalsy: any = 0;
botest.assertValueEquals(numFalsy || 5, 5, "zero returns right");

const negNum: any = -1;
botest.assertValueEquals(negNum || "fallback", -1, "negative number is truthy");

// Null / undefined
const nul: any = null;
botest.assertValueEquals(nul || "fallback", "fallback", "null returns right");

const und: any = undefined;
botest.assertValueEquals(und || "fallback", "fallback", "undefined returns right");

// Boolean
const bFalse: any = false;
botest.assertValueEquals(bFalse || "fallback", "fallback", "false returns right");

const bTrue: any = true;
botest.assertValueEquals(bTrue || "fallback", true, "true returns left");

// =============================================================================
// Chained ||
// =============================================================================

const cA: any = "";
const cB: any = 0;
botest.assertValueEquals(cA || cB || "found", "found", "chained: first truthy wins");

const cC: any = "";
botest.assertValueEquals(cC || "second" || "third", "second", "chained: stops at first truthy");

const cD: any = null;
const cE: any = undefined;
const cF: any = 0;
const cG: any = false;
botest.assertValueEquals(cD || cE || cF || cG || "last", "last", "chained: all falsy until last");

const cH: any = "first";
botest.assertValueEquals(cH || "second" || "third", "first", "chained: first already truthy");

// =============================================================================
// || in expression contexts
// =============================================================================

const empty: any = "";
botest.assertValueEquals("prefix:" + (empty || "default"), "prefix:default", "|| inside string concat");

const empty2: any = "";
const ternaryResult = (empty2 || "val") === "val" ? "yes" : "no";
botest.assertValueEquals(ternaryResult, "yes", "|| result used in comparison");

// || as function argument
function identity(x: any): any {
  return x;
}
const falsy: any = 0;
botest.assertValueEquals(identity(falsy || 99), 99, "|| as function argument");

// || in variable declaration
const falsy2: any = null;
const declared = falsy2 || "default";
botest.assertValueEquals(declared, "default", "|| in variable declaration");

// || in assignment
let assigned: any = "initial";
const falsy3: any = undefined;
assigned = falsy3 || "reassigned";
botest.assertValueEquals(assigned, "reassigned", "|| in assignment");

botest.assertOk();

export {};
