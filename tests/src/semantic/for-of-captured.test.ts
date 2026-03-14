/**
 * For-of loop with captured variables in closures.
 *
 * Verifies that const loop variable is correctly captured when used
 * inside a closure in for-of (each closure sees its iteration's value).
 *
 * Note: Multiple arrows in same loop can cause __arrowN naming conflicts;
 * this test uses a single callback per loop via wrapper.
 */
function captureConstInLoop(): (() => number)[] {
  const arr = [1, 2, 3];
  const result: (() => number)[] = [];
  for (const item of arr) {
    result.push(() => item);
  }
  return result;
}

const callbacks = captureConstInLoop();
botest.assertValueEquals(callbacks[0](), 1, "const capture: first sees 1");
botest.assertValueEquals(callbacks[1](), 2, "const capture: second sees 2");
botest.assertValueEquals(callbacks[2](), 3, "const capture: third sees 3");

botest.assertOk();

export {};
