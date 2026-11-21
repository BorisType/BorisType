function track(state: { trace: string }, value: boolean, label: string): boolean {
  state.trace += label;
  return value;
}

const state = { trace: "" };

const short = track(state, false, "L") && track(state, true, "R");
botest.assertValueEquals(short, false, "false left operand gives false");
botest.assertValueEquals(state.trace, "L", "false left operand skips the right operand");

state.trace = "";
const both = track(state, true, "L") && track(state, true, "R");
botest.assertValueEquals(both, true, "two true operands give true");
botest.assertValueEquals(state.trace, "LR", "true left operand evaluates the right operand once");

state.trace = "";
const stopped = track(state, true, "A") && track(state, false, "B") && track(state, true, "C");
botest.assertValueEquals(stopped, false, "a false operand makes the chain false");
botest.assertValueEquals(state.trace, "AB", "the chain stops at the first false operand");

state.trace = "";
const all = track(state, true, "A") && track(state, true, "B") && track(state, true, "C");
botest.assertValueEquals(all, true, "a chain of true operands gives true");
botest.assertValueEquals(state.trace, "ABC", "the chain evaluates true operands in order");

state.trace = "";
const skipRight = false;
const skipped = skipRight && track(state, true, "R");
botest.assertValueEquals(skipped, false, "the left operand determines the result");
botest.assertValueEquals(state.trace, "", "an unevaluated right operand has no effects");

const evaluateRight = true;
const evaluated = evaluateRight && track(state, false, "R");
botest.assertValueEquals(evaluated, false, "the right operand determines the result");
botest.assertValueEquals(state.trace, "R", "the right operand runs once");

botest.assertOk();

export {};
