/** Named, bounded source probes. Expected values are JS contracts, not BS snapshots. */
export const expressionCases = [
  {
    id: "control-plain-order",
    finding: "control",
    modes: ["bare"],
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
    modes: ["bare"],
    expected: "3|2",
    body: `var ledger = {count: 0};
var guard = 0;
function next(state: {count: number}) { state.count = state.count + 1; return state.count < 3; }
while (next(ledger)) { guard++; if (guard >= 5) break; }
return "" + ledger.count + "|" + guard;`,
  },
];

/** Wrap each case separately so state cannot leak between probes or modes. */
export function expressionSource(item) {
  return `function runProbe(): string {\n${item.body}\n}\nvar result = runProbe();\n`;
}
