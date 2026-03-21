/**
 * Node.js-compatible botest shim.
 *
 * Loaded via `--require` before test execution in Node.js validation mode.
 * Provides the same botest global API surface but using standard Node.js
 * semantics: assertions exit(1) on failure, assertOk exits(0) cleanly.
 *
 * This validates that test logic is correct in pure JS, independently
 * of the BorisScript interpreter.
 */

let _assertOkCalled = false;

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => keysB.includes(key) && deepEqual(objA[key], objB[key]));
}

function fail(message: string, details?: Record<string, unknown>): never {
  const parts = [`ASSERT FAIL: ${message}`];
  if (details) {
    for (const [key, value] of Object.entries(details)) {
      parts.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
  console.error(parts.join("\n"));
  process.exit(1);
}

(globalThis as any).botest = {
  init() {},

  assertOk() {
    _assertOkCalled = true;
    process.exit(0);
  },

  assertFail(message: string) {
    fail(message);
  },

  assertValueEquals(actual: any, expected: any, message?: string) {
    if (!deepEqual(actual, expected)) {
      fail(message || "assertValueEquals", { Expected: expected, Actual: actual });
    }
  },

  assertJsArrayEquals(actual: any[], expected: any[], message?: string) {
    (globalThis as any).botest.assertValueEquals(actual, expected, message);
  },

  assertJsObjectEquals(actual: any, expected: any, message?: string) {
    (globalThis as any).botest.assertValueEquals(actual, expected, message);
  },

  assertTrue(value: any, message?: string) {
    if (value !== true) {
      fail(message || "assertTrue", { Value: value });
    }
  },

  assertFalse(value: any, message?: string) {
    if (value !== false) {
      fail(message || "assertFalse", { Value: value });
    }
  },
};

// Provide alert() stub — used by some tests for debug output
(globalThis as any).alert = () => {};

(globalThis as any).Md5Hex = (input: string): string => {
  const crypto = require("crypto");
  return crypto.createHash("md5").update(input).digest("hex");
};

(globalThis as any).Trim = (input: string): string => {
  return input.trim();
};

(globalThis as any).ArrayUnion = (...arrs: any[]): any[] => {
  return Array.from(new Set(arrs.flat()));
};

(globalThis as any).globalCache = {
  storage: new Map<string, any>(),
  get(key: string): any {
    return this.storage.get(key);
  },
  set(key: string, value: any): void {
    this.storage.set(key, value);
  },
  has(key: string): boolean {
    return this.storage.has(key);
  },
};

(globalThis as any).StrBegins = (str: string, prefix: string): boolean => {
  return str.startsWith(prefix);
};

(globalThis as any).StrEnds = (str: string, suffix: string): boolean => {
  return str.endsWith(suffix);
};

(globalThis as any).StrCharCount = (str: string): number => {
  return str.length;
};

// Safety: if test exits without calling assertOk(), treat as failure
process.on("exit", (code) => {
  if (code === 0 && !_assertOkCalled) {
    console.error("Test completed without calling botest.assertOk()");
    process.exitCode = 1;
  }
});
