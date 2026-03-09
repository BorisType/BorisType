// =============================================================================
// Exploration test: Expression extraction hypotheses
//
// Проверяем, какие комбинации "сложных выражений внутри других выражений"
// ломают парсер BorisScript. Каждый assertValueEquals проверяет конкретный кейс.
// =============================================================================

// ---- Setup ----
const obj: any = {
  a: {
    b: {
      c: 42,
      d: "hello",
    },
  },
};

const nullObj: any = null;
const shallow: any = { x: 10, y: 20 };

// =============================================================================
// Group 1: Optional chaining in binary expressions (+ - * / == etc.)
// =============================================================================

// 1a. Template literal: `A ${obj?.x} B` — KNOWN BUG
const case1a = `PREFIX ${obj?.a?.b?.c} SUFFIX`;
botest.assertValueEquals(case1a, "PREFIX 42 SUFFIX", "1a: optional chain in template literal");

// 1b. String concat: "A" + obj?.x + "B"
const case1b = "PREFIX " + obj?.a?.b?.c + " SUFFIX";
botest.assertValueEquals(case1b, "PREFIX 42 SUFFIX", "1b: optional chain in string concat");

// 1c. Addition: obj?.x + 1
const case1c = obj?.a?.b?.c + 1;
botest.assertValueEquals(case1c, 43, "1c: optional chain + number");

// 1d. Addition reversed: 1 + obj?.x
const case1d = 1 + obj?.a?.b?.c;
botest.assertValueEquals(case1d, 43, "1d: number + optional chain");

// 1e. Comparison: obj?.x === 42
const case1e = obj?.a?.b?.c === 42;
botest.assertValueEquals(case1e, true, "1e: optional chain === value");

// 1f. Comparison reversed: 42 === obj?.x
const case1f = 42 === obj?.a?.b?.c;
botest.assertValueEquals(case1f, true, "1f: value === optional chain");

// 1g. Two optional chains in one binary: obj?.a + other?.b
const case1g = obj?.a?.b?.c + shallow?.x;
botest.assertValueEquals(case1g, 52, "1g: two optional chains in binary");

// 1h. Subtraction: obj?.x - 2
const case1h = obj?.a?.b?.c - 2;
botest.assertValueEquals(case1h, 40, "1h: optional chain - number");

// 1i. Multiplication: obj?.x * 2
const case1i = obj?.a?.b?.c * 2;
botest.assertValueEquals(case1i, 84, "1i: optional chain * number");

// =============================================================================
// Group 2: Optional chaining with null (undefined result) in expressions
// =============================================================================

// 2a. Null chain in concat: should produce "PREFIX undefined SUFFIX"
const case2a = "PREFIX " + nullObj?.x + " SUFFIX";
botest.assertValueEquals(
  case2a,
  "PREFIX undefined SUFFIX",
  "2a: null optional chain in string concat",
);

// 2b. Null chain in template
const case2b = `PREFIX ${nullObj?.x} SUFFIX`;
botest.assertValueEquals(
  case2b,
  "PREFIX undefined SUFFIX",
  "2b: null optional chain in template literal",
);

// =============================================================================
// Group 3: Optional chaining inside function call arguments
// =============================================================================

// 3a. As argument to function call
function identity(val: any): any {
  return val;
}
const case3a = identity(obj?.a?.b?.c);
botest.assertValueEquals(case3a, 42, "3a: optional chain as call argument");

// 3b. In concat inside argument
const case3b = identity("V=" + obj?.a?.b?.c);
botest.assertValueEquals(case3b, "V=42", "3b: optional chain in concat inside call arg");

// =============================================================================
// Group 4: Optional chaining in array/object literals
// =============================================================================

// 4a. As array element
const case4a = [obj?.a?.b?.c, 100];
botest.assertValueEquals(case4a[0], 42, "4a: optional chain as array element [0]");
botest.assertValueEquals(case4a[1], 100, "4a: optional chain as array element [1]");

// 4b. As object value
const case4b = { key: obj?.a?.b?.c };
botest.assertValueEquals(case4b.key, 42, "4b: optional chain as object value");

// =============================================================================
// Group 5: Optional chaining in logical expressions
// =============================================================================

// НЕ БУДЕТ РАБОТАТЬ потому что || и && работают исключительно с булевыми значениями
// надо писать polyfill для них, который будет поддерживать любые типы и не будет приводить к булевому

// // 5a. obj?.x || fallback
// const case5a = nullObj?.x || "fallback";
// botest.assertValueEquals(case5a, "fallback", "5a: null optional chain || fallback");

// // 5b. obj?.x && next
// const case5b = obj?.a?.b?.c && "found";
// botest.assertValueEquals(case5b, "found", "5b: optional chain && 'found'");

// // 5c. Logical inside binary
// const case5c = "result:" + (nullObj?.x || "default");
// botest.assertValueEquals(case5c, "result:default", "5c: (optional chain || fallback) in concat");

// =============================================================================
// Group 6: Ternary (non-optional-chaining) inside expressions
// =============================================================================

const x = 5;

// 6a. Ternary in template literal
const case6a = `VALUE ${x > 0 ? x : 0} END`;
botest.assertValueEquals(case6a, "VALUE 5 END", "6a: ternary in template literal");

// 6b. Ternary in concat
const case6b = "VALUE " + (x > 0 ? x : 0) + " END";
botest.assertValueEquals(case6b, "VALUE 5 END", "6b: ternary in string concat");

// 6c. Ternary in addition
const case6c = (x > 0 ? x : 0) + 100;
botest.assertValueEquals(case6c, 105, "6c: ternary + number");

// =============================================================================
// Group 7: Optional chaining inside ternary
// =============================================================================

// 7a. obj?.x in condition of ternary
const case7a = obj?.a?.b?.c ? "truthy" : "falsy";
botest.assertValueEquals(case7a, "truthy", "7a: optional chain as ternary condition");

// 7b. obj?.x in branches of ternary
const flag = true;
const case7b = flag ? obj?.a?.b?.c : 0;
botest.assertValueEquals(case7b, 42, "7b: optional chain in ternary branch");

// =============================================================================
// Group 8: Simple assignment (should already work)
// =============================================================================

// 8a. Direct assignment
const case8a = obj?.a?.b?.c;
botest.assertValueEquals(case8a, 42, "8a: direct assignment of optional chain");

// =============================================================================
// Group 9: Nested optional chains with property access after
// =============================================================================

// 9a. Optional chain then property: (obj?.a)?.b — should work as chain
const case9a = obj?.a?.b?.d;
botest.assertValueEquals(case9a, "hello", "9a: multi-level optional chain to string");

// 9b. Template with string optional chain result
const case9b = `GOT ${obj?.a?.b?.d} !`;
botest.assertValueEquals(case9b, "GOT hello !", "9b: optional chain string in template");

botest.assertOk();

export {};
