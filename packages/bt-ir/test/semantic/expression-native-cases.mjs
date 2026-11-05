/** Raw target syntax, intentionally independent of TypeScript lowering and bt helpers. */
export const expressionNativeCases = [
  { id: "grouped-ternary-binary", expected: "4", code: `var value = (true ? 1 : 2) + 3; var result = "" + value;` },
  {
    id: "grouped-ternary-argument",
    expected: "4",
    code: `function add(a, b) { return a + b; } var value = add((true ? 1 : 2), 3); var result = "" + value;`,
  },
  { id: "grouped-ternary-array", expected: "4", code: `var values = [(true ? 1 : 2), 3]; var result = "" + (values[0] + values[1]);` },
  { id: "grouped-ternary-object", expected: "4", code: `var value = {x: (true ? 1 : 2)}; var result = "" + (value.x + 3);` },
  {
    id: "grouped-ternary-short-circuit",
    expected: "0|false",
    code: `
function bump(state) { state.count++; return true; }
var state = {count: 0};
var value = false && (true ? bump(state) : false);
var result = ("" + state.count) + "|" + value;`,
  },
  {
    id: "grouped-ternary-while",
    expected: "3|2",
    code: `
function next(state) { state.count++; return state.count < 3; }
var state = {count: 0}; var guard = 0;
while ((next(state) ? true : false)) { guard++; if (guard >= 5) break; }
var result = ("" + state.count) + "|" + guard;`,
  },
  { id: "grouped-ternary-member", expected: "1", code: `var value = (true ? {x: 1} : {x: 2}).x; var result = "" + value;` },
  {
    id: "dynamic-case",
    expected: "A",
    code: `
var trace = ""; var key = 1;
switch (1) { case key: trace += "A"; break; default: trace += "B"; }
var result = trace;`,
  },
];
