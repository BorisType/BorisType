/**
 * Тест: function expression и arrow function должны работать одинаково —
 * обе должны создавать дескриптор и корректно вызываться как callback.
 */

// ============================================================================
// Helper: принимает callback и вызывает его
// ============================================================================

function callWith(fn: (a: number, b: number) => number, a: number, b: number): number {
  return fn(a, b);
}

// ============================================================================
// 1. Anonymous function expression как callback
// ============================================================================

const res1 = callWith(
  function (a: number, b: number) {
    return a + b;
  },
  3,
  4,
);
botest.assertValueEquals(res1, 7, "anonymous func expr callback should return 7");

// ============================================================================
// 2. Named function expression как callback
// ============================================================================

const res2 = callWith(
  function sum(a: number, b: number) {
    return a * b;
  },
  3,
  4,
);
botest.assertValueEquals(res2, 12, "named func expr callback should return 12");

// ============================================================================
// 3. Arrow function как callback (parity check)
// ============================================================================

const res3 = callWith((a: number, b: number) => a + b, 3, 4);
botest.assertValueEquals(res3, 7, "arrow func callback should return 7");

// ============================================================================
// 4. Function expression с захватом внешней переменной
// ============================================================================

function testCapturedFuncExpr(): number {
  const multiplier = 10;
  const fn = function (x: number) {
    return x * multiplier;
  };
  return fn(5);
}
const res4 = testCapturedFuncExpr();
botest.assertValueEquals(res4, 50, "func expr capturing outer var should return 50");

// ============================================================================
// 5. Arrow function с захватом внешней переменной (parity check)
// ============================================================================

function testCapturedArrow(): number {
  const multiplier = 10;
  const fn = (x: number) => x * multiplier;
  return fn(5);
}
const res5 = testCapturedArrow();
botest.assertValueEquals(res5, 50, "arrow func capturing outer var should return 50");

// ============================================================================
// 6. Function expression передаваемый через массив (как в routes.ts)
// ============================================================================

function runChain(callbacks: Array<(v: number) => number>, value: number): number {
  let result = value;
  for (const cb of callbacks) {
    result = cb(result);
  }
  return result;
}

const res6 = runChain(
  [
    function (v: number) {
      return v + 1;
    },
    function (v: number) {
      return v * 2;
    },
    (v: number) => v + 10,
  ],
  5,
);
botest.assertValueEquals(res6, 22, "chain of func exprs and arrows should return 22");

// ============================================================================
// 7. Function expression как свойство объекта (inline)
// ============================================================================

function executeHandler(handler: { run: (x: number) => number }, x: number): number {
  return handler.run(x);
}

const res7 = executeHandler(
  {
    run: function (x: number) {
      return x + 100;
    },
  },
  5,
);
botest.assertValueEquals(res7, 105, "func expr in object should return 105");

const res8 = executeHandler(
  {
    run: (x: number) => x + 100,
  },
  5,
);
botest.assertValueEquals(res8, 105, "arrow func in object should return 105");

botest.assertOk();

export {};
