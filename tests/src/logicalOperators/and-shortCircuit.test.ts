// =============================================================================
// && short-circuit evaluation
// Falsy left — right NOT evaluated; truthy left — right IS evaluated
// =============================================================================

let sideEffect = "";

function track(value: any, label: string): any {
  sideEffect = sideEffect + label;
  return value;
}

// Falsy left — right NOT evaluated
sideEffect = "";
const sc1 = track("", "L") && track("unused", "R");
botest.assertValueEquals(sc1, "", "falsy left returns left");
botest.assertValueEquals(sideEffect, "L", "right not evaluated when left falsy");

// Truthy left — right IS evaluated
sideEffect = "";
const sc2 = track("hello", "L") && track("world", "R");
botest.assertValueEquals(sc2, "world", "truthy left returns right");
botest.assertValueEquals(sideEffect, "LR", "both sides evaluated when left truthy");

// Chained short-circuit: first falsy stops evaluation
sideEffect = "";
const sc3 = track("a", "A") && track("", "B") && track("unused", "C");
botest.assertValueEquals(sc3, "", "chained: stops at first falsy");
botest.assertValueEquals(sideEffect, "AB", "chained: C not evaluated");

// Chained short-circuit: all truthy evaluates everything
sideEffect = "";
const sc4 = track("a", "A") && track("b", "B") && track("c", "C");
botest.assertValueEquals(sc4, "c", "chained: all truthy returns last");
botest.assertValueEquals(sideEffect, "ABC", "chained: all sides evaluated");

// Short-circuit with function calls
let callCount = 0;
function expensive(): string {
  callCount = callCount + 1;
  return "expensive";
}

const falsy: any = 0;
callCount = 0;
const sc5 = falsy && expensive();
botest.assertValueEquals(sc5, 0, "function call not needed");
botest.assertValueEquals(callCount, 0, "expensive function not called");

const truthy: any = "exists";
callCount = 0;
const sc6 = truthy && expensive();
botest.assertValueEquals(sc6, "expensive", "function call needed");
botest.assertValueEquals(callCount, 1, "expensive function called once");

botest.assertOk();

export {};
