/**
 * @fileoverview Tests for no-break-in-try-finally rule.
 */

import { RuleTester } from "eslint";
import rule from "./no-break-in-try-finally";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("no-break-in-try-finally", rule, {
  valid: [
    // break in loop inside try (targets inner loop — safe)
    `
      try {
        for (let i = 0; i < 10; i++) {
          break;
        }
      } finally {
        cleanup();
      }
    `,

    // continue in loop inside try (targets inner loop — safe)
    `
      try {
        for (let i = 0; i < 10; i++) {
          continue;
        }
      } finally {
        cleanup();
      }
    `,

    // break in switch inside try (targets switch — safe)
    `
      try {
        switch (x) {
          case 1: break;
        }
      } finally {
        cleanup();
      }
    `,

    // break in try without finally (no problem)
    `
      for (let i = 0; i < 10; i++) {
        try {
          break;
        } catch (e) {}
      }
    `,

    // break in loop, no try-finally involved
    `
      for (let i = 0; i < 10; i++) {
        if (i === 5) break;
      }
    `,

    // return in try with finally (handled by desugaring)
    `
      function foo() {
        try {
          return 1;
        } finally {
          cleanup();
        }
      }
    `,

    // break inside finally block itself (safe — finally is inlined)
    `
      for (let i = 0; i < 10; i++) {
        try {
          doSomething();
        } finally {
          break;
        }
      }
    `,
  ],

  invalid: [
    // break in try with finally, targeting outer loop
    {
      code: `
        for (let i = 0; i < 10; i++) {
          try {
            break;
          } finally {
            cleanup();
          }
        }
      `,
      errors: [{ messageId: "noBreakInTryFinally" }],
    },

    // continue in try with finally, targeting outer loop
    {
      code: `
        for (let i = 0; i < 10; i++) {
          try {
            continue;
          } finally {
            cleanup();
          }
        }
      `,
      errors: [{ messageId: "noContinueInTryFinally" }],
    },

    // break in catch with finally, targeting outer loop
    {
      code: `
        for (let i = 0; i < 10; i++) {
          try {
            throw "err";
          } catch (e) {
            break;
          } finally {
            cleanup();
          }
        }
      `,
      errors: [{ messageId: "noBreakInTryFinally" }],
    },

    // continue in catch with finally, targeting outer loop
    {
      code: `
        while (true) {
          try {
            doSomething();
          } catch (e) {
            continue;
          } finally {
            cleanup();
          }
        }
      `,
      errors: [{ messageId: "noContinueInTryFinally" }],
    },

    // break in nested if inside try with finally
    {
      code: `
        for (let i = 0; i < 10; i++) {
          try {
            if (i === 5) {
              break;
            }
          } finally {
            cleanup();
          }
        }
      `,
      errors: [{ messageId: "noBreakInTryFinally" }],
    },

    // break in do-while outer with try-finally
    {
      code: `
        do {
          try {
            break;
          } finally {
            cleanup();
          }
        } while (true);
      `,
      errors: [{ messageId: "noBreakInTryFinally" }],
    },
  ],
});
