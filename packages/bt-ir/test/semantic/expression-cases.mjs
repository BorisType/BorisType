/** Named, bounded source probes. Expected values are JS contracts, not BS snapshots. */
export const expressionCases = [
  {
    id: "r01-and-skip",
    finding: "R01",
    expected: "0|false",
    body: `var count = 0;
function make() { count = count + 1; return {x: 9}; }
var value = false && make()?.x;
return "" + count + "|" + value;`,
  },
  {
    id: "r01-or-skip",
    finding: "R01",
    expected: "0|true",
    body: `var count = 0;
function make() { count = count + 1; return {x: 9}; }
var value = true || make()?.x;
return "" + count + "|" + value;`,
  },
  {
    id: "r01-conditional-skip",
    finding: "R01",
    expected: "0|7",
    body: `var count = 0;
function make() { count = count + 1; return {x: 9}; }
var value = true ? 7 : make()?.x;
return "" + count + "|" + value;`,
  },
  {
    id: "r01-nullish-skip",
    finding: "R01",
    expected: "0|7",
    body: `var count = 0;
function make() { count = count + 1; return {x: 9}; }
var left: number | undefined = 7;
var value = left ?? make()?.x;
return "" + count + "|" + value;`,
  },
  {
    id: "r02-argument-order",
    finding: "R02",
    expected: "AB|3",
    body: `var trace = "";
function first() { trace += "A"; return 1; }
function second() { trace += "B"; return {x: 2}; }
function add(a: number, b: number) { return a + b; }
var value = add(first(), (second()?.x as number));
return trace + "|" + value;`,
  },
  {
    id: "r03-while-frequency",
    finding: "R03",
    expected: "3|2",
    body: `var count = 0;
var guard = 0;
function next() { count = count + 1; return {v: count < 3 ? 1 : 0}; }
while (next()?.v !== 0) { guard++; if (guard >= 5) break; }
return "" + count + "|" + guard;`,
  },
  {
    id: "early-value-before-mutation",
    finding: "E-05",
    expected: "9|3",
    body: `var x = 1;
function mutate() { x = 9; return {v: 2}; }
var value = x + (mutate()?.v as number);
return "" + x + "|" + value;`,
  },
  {
    id: "skipped-throw",
    finding: "E-04",
    expected: "A",
    body: `var trace = "";
function boom(): {x: number} { trace += "X"; throw "stop"; }
try { var value = false && boom()?.x; trace += "A"; }
catch (e) { trace += "C"; }
return trace;`,
  },
  {
    id: "argument-throw-order",
    finding: "E-05",
    expected: "AXC",
    body: `var trace = "";
function first() { trace += "A"; return 1; }
function boom(): {x: number} { trace += "X"; throw "stop"; }
function add(a: number, b: number) { return a + b; }
try { add(first(), (boom()?.x as number)); }
catch (e) { trace += "C"; }
return trace;`,
  },
  {
    id: "receiver-before-argument",
    finding: "E-05",
    expected: "RAB|3",
    body: `var trace = "";
function add(a: number, b: number) { return a + b; }
function receiver() { trace += "R"; return {add: add}; }
function first() { trace += "A"; return 1; }
function second() { trace += "B"; return {x: 2}; }
var value = receiver().add(first(), (second()?.x as number));
return trace + "|" + value;`,
  },
  {
    id: "elseif-skipped-test",
    finding: "E-07",
    expected: "T",
    body: `var trace = "";
function next() { trace += "X"; return {v: 1}; }
if (true) { trace += "T"; }
else if (next()?.v !== 0) { trace += "F"; }
return trace;`,
  },
  {
    id: "for-test-frequency",
    finding: "E-06",
    expected: "3|2",
    body: `var count = 0;
var guard = 0;
function next() { count = count + 1; return {v: count < 3 ? 1 : 0}; }
for (; next()?.v !== 0;) { guard++; if (guard >= 5) break; }
return "" + count + "|" + guard;`,
  },
  {
    id: "do-test-frequency",
    finding: "E-06",
    expected: "3|3",
    body: `var count = 0;
var guard = 0;
function next() { count = count + 1; return {v: count < 3 ? 1 : 0}; }
do { guard++; if (guard >= 5) break; } while (next()?.v !== 0);
return "" + count + "|" + guard;`,
  },
  {
    id: "for-update-frequency",
    finding: "E-06",
    expected: "0U1U2U|3",
    body: `var trace = "";
var guard = 0;
function step() { trace += "U"; return {v: 1}; }
for (var i = 0; i < 3; i = i + (step()?.v as number)) {
  guard++; if (guard >= 5) break; trace += i;
}
return trace + "|" + guard;`,
  },
  {
    id: "array-element-order",
    finding: "E-07",
    expected: "AB|3",
    body: `var trace = "";
function first() { trace += "A"; return 1; }
function second() { trace += "B"; return {x: 2}; }
var values = [first(), (second()?.x as number)];
return trace + "|" + (values[0] + values[1]);`,
  },
  {
    id: "optional-key-skip",
    finding: "E-04",
    expected: "0|undefined",
    body: `var count = 0;
function absent(): {[key: string]: number} | undefined { return undefined; }
function key() { count = count + 1; return {name: "x"}; }
var value = absent()?.[(key()?.name as string) + ""];
return "" + count + "|" + value;`,
  },
  {
    id: "object-method-branch-skip",
    finding: "E-04",
    expected: "0|false",
    body: `var count = 0;
function first() { count = count + 1; return 1; }
var value = false && {x: first(), method() { return 0; }};
return "" + count + "|" + value;`,
  },
  {
    id: "parameter-default-skipped",
    finding: "E-07",
    expected: "0|7",
    body: `var count = 0;
function make() { count = count + 1; return {x: 9}; }
function choose(value: number = (make()?.x as number) + 0) { return value; }
var value = choose(7);
return "" + count + "|" + value;`,
  },
  {
    id: "parameter-default-before-body",
    finding: "E-07",
    expected: "1|9",
    body: `var count = 0;
function make() { count = count + 1; return {x: 9}; }
function choose(value: number = (make()?.x as number) + 0) { return value; }
var value = "";
try { value = "" + choose(); } catch (e) { value = "C"; }
return "" + count + "|" + value;`,
  },
  {
    id: "control-plain-order",
    finding: "control",
    modes: ["bare", "script", "module"],
    expected: "AB|3",
    body: `var ledger = {trace: ""};
function first(state: {trace: string}) { state.trace += "A"; return 1; }
function second(state: {trace: string}) { state.trace += "B"; return 2; }
function add(a: number, b: number) { return a + b; }
var value = add(first(ledger), second(ledger));
return ledger.trace + "|" + value;`,
  },
  {
    id: "control-plain-while",
    finding: "control",
    modes: ["bare", "script", "module"],
    expected: "3|2",
    body: `var ledger = {count: 0};
var guard = 0;
function next(state: {count: number}) { state.count = state.count + 1; return state.count < 3; }
while (next(ledger)) { guard++; if (guard >= 5) break; }
return "" + ledger.count + "|" + guard;`,
  },
  {
    id: "control-selected-optional",
    finding: "control",
    expected: "1|9",
    body: `var count = 0;
function make() { count = count + 1; return {x: 9}; }
var value = true && make()?.x;
return "" + count + "|" + value;`,
  },
  {
    id: "control-logical-values",
    finding: "control",
    expected: "7|0|false",
    body: `var a: number | undefined = 7;
var b = 0;
var c = false;
var x = a || 2;
var y = b && 4;
var z = c ?? true;
return "" + x + "|" + y + "|" + z;`,
  },
];

/** Wrap each case separately so state cannot leak between probes or modes. */
export function expressionSource(item, mode) {
  return `function runProbe(): string {\n${item.body}\n}\n${mode === "module" ? "export " : ""}var result = runProbe();\n`;
}
