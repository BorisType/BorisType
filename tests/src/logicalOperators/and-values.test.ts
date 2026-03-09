// =============================================================================
// && value return semantics — JS-compatible behavior
// Falsy left → return left; truthy left → return right
// =============================================================================

// String
const strTruthy: any = "hello";
botest.assertValueEquals(strTruthy && "world", "world", "truthy string returns right");

const strFalsy: any = "";
botest.assertValueEquals(strFalsy && "world", "", "empty string returns left (empty string)");

// Number
const numTruthy: any = 42;
botest.assertValueEquals(numTruthy && 99, 99, "truthy number returns right");

const numFalsy: any = 0;
botest.assertValueEquals(numFalsy && 99, 0, "zero returns left (zero)");

const negNum: any = -1;
botest.assertValueEquals(negNum && "result", "result", "negative number is truthy, returns right");

// Null / undefined
const nul: any = null;
botest.assertValueEquals(nul && "never", null, "null returns left (null)");

const und: any = undefined;
botest.assertValueEquals(und && "never", undefined, "undefined returns left (undefined)");

// Boolean
const bFalse: any = false;
botest.assertValueEquals(bFalse && "never", false, "false returns left (false)");

const bTrue: any = true;
botest.assertValueEquals(bTrue && "result", "result", "true returns right");

// =============================================================================
// Chained &&
// =============================================================================

const cA: any = "a";
const cB: any = "b";
const cC: any = "c";
botest.assertValueEquals(cA && cB && cC, "c", "chained: all truthy returns last");

const cD: any = "a";
const cE: any = 0;
const cF: any = "c";
botest.assertValueEquals(cD && cE && cF, 0, "chained: stops at first falsy");

const cG: any = "";
botest.assertValueEquals(cG && "x" && "y", "", "chained: first is falsy, returns first");

// =============================================================================
// && in expression contexts
// =============================================================================

const truthy: any = "hello";
botest.assertValueEquals(
  "prefix:" + (truthy && "world"),
  "prefix:world",
  "&& inside string concat",
);

function identity(x: any): any {
  return x;
}
const val: any = 1;
botest.assertValueEquals(identity(val && 42), 42, "&& as function argument");

// && in variable declaration
const truthy2: any = "exists";
const declared = truthy2 && "result";
botest.assertValueEquals(declared, "result", "&& in variable declaration");

// && in assignment
let assigned: any = "initial";
const falsy: any = null;
assigned = falsy && "never";
botest.assertValueEquals(assigned, null, "&& in assignment with falsy left");

botest.assertOk();

export {};
