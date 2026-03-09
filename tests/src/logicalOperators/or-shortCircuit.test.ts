// =============================================================================
// || short-circuit evaluation
// =============================================================================

let sideEffect = "";

function track(value: any, label: string): any {
  sideEffect = sideEffect + label;
  return value;
}

// Truthy left — right NOT evaluated
sideEffect = "";
const sc1 = track("truthy", "L") || track("unused", "R");
botest.assertValueEquals(sc1, "truthy", "truthy left returns left");
botest.assertValueEquals(sideEffect, "L", "right not evaluated when left truthy");

// Falsy left — right IS evaluated
sideEffect = "";
const sc2 = track("", "L") || track("right", "R");
botest.assertValueEquals(sc2, "right", "falsy left returns right");
botest.assertValueEquals(sideEffect, "LR", "both sides evaluated when left falsy");

// Chained short-circuit: first truthy stops evaluation
sideEffect = "";
const sc3 = track("", "A") || track("found", "B") || track("unused", "C");
botest.assertValueEquals(sc3, "found", "chained: stops at first truthy");
botest.assertValueEquals(sideEffect, "AB", "chained: C not evaluated");

// Chained short-circuit: all falsy evaluates everything
sideEffect = "";
const sc4 = track("", "A") || track(0, "B") || track(null, "C") || track("end", "D");
botest.assertValueEquals(sc4, "end", "chained: all falsy until last");
botest.assertValueEquals(sideEffect, "ABCD", "chained: all sides evaluated");

// Short-circuit with function calls as operands
let callCount = 0;
function expensive(): string {
  callCount = callCount + 1;
  return "expensive";
}

const truthy: any = "exists";
callCount = 0;
const sc5 = truthy || expensive();
botest.assertValueEquals(sc5, "exists", "function call not needed");
botest.assertValueEquals(callCount, 0, "expensive function not called");

const falsy: any = null;
callCount = 0;
const sc6 = falsy || expensive();
botest.assertValueEquals(sc6, "expensive", "function call needed");
botest.assertValueEquals(callCount, 1, "expensive function called once");

botest.assertOk();

export {};
