function track(state: { trace: string }, value: boolean, label: string): boolean {
  state.trace += label;
  return value;
}

const state = { trace: "" };

const short = track(state, true, "L") || track(state, false, "R");
botest.assertValueEquals(short, true, "true left operand gives true");
botest.assertValueEquals(state.trace, "L", "true left operand skips the right operand");

state.trace = "";
const both = track(state, false, "L") || track(state, false, "R");
botest.assertValueEquals(both, false, "two false operands give false");
botest.assertValueEquals(state.trace, "LR", "false left operand evaluates the right operand once");

state.trace = "";
const stopped = track(state, false, "A") || track(state, true, "B") || track(state, false, "C");
botest.assertValueEquals(stopped, true, "a true operand makes the chain true");
botest.assertValueEquals(state.trace, "AB", "the chain stops at the first true operand");

state.trace = "";
const all = track(state, false, "A") || track(state, false, "B") || track(state, false, "C");
botest.assertValueEquals(all, false, "a chain of false operands gives false");
botest.assertValueEquals(state.trace, "ABC", "the chain evaluates false operands in order");

state.trace = "";
const skipRight = true;
const skipped = skipRight || track(state, false, "R");
botest.assertValueEquals(skipped, true, "the left operand determines the result");
botest.assertValueEquals(state.trace, "", "an unevaluated right operand has no effects");

const evaluateRight = false;
const evaluated = evaluateRight || track(state, true, "R");
botest.assertValueEquals(evaluated, true, "the right operand determines the result");
botest.assertValueEquals(state.trace, "R", "the right operand runs once");

botest.assertOk();

export {};
