/**
 * @fileoverview Tests for no-generators rule.
 */

import { RuleTester } from "eslint";
import rule from "./no-generators";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("no-generators", rule, {
  valid: [
    // Regular function declaration
    "function getData() { return [1, 2, 3]; }",

    // Regular function expression
    "var fn = function() { return 1; };",

    // Arrow function
    "var fn = () => [1, 2, 3];",

    // Method shorthand
    "var obj = { method() { return 1; } };",

    // Regular for loop
    "for (var i = 0; i < 10; i++) {}",
  ],

  invalid: [
    // Generator function declaration
    {
      code: "function* gen() {}",
      errors: [{ messageId: "noGeneratorFunction" }],
    },

    // Generator function expression
    {
      code: "var gen = function*() {};",
      errors: [{ messageId: "noGeneratorFunction" }],
    },

    // Generator method in object
    {
      code: "var obj = { *gen() {} };",
      errors: [{ messageId: "noGeneratorFunction" }],
    },

    // Yield expression inside generator
    {
      code: "function* gen() { yield 1; }",
      errors: [
        { messageId: "noGeneratorFunction" },
        { messageId: "noYieldExpression" },
      ],
    },

    // Multiple yield expressions
    {
      code: `
        function* gen() {
          yield 1;
          yield 2;
          yield 3;
        }
      `,
      errors: [
        { messageId: "noGeneratorFunction" },
        { messageId: "noYieldExpression" },
        { messageId: "noYieldExpression" },
        { messageId: "noYieldExpression" },
      ],
    },

    // yield* delegation
    {
      code: "function* gen() { yield* otherGen(); }",
      errors: [
        { messageId: "noGeneratorFunction" },
        { messageId: "noYieldExpression" },
      ],
    },

    // Named generator expression
    {
      code: "var gen = function* myGen() { yield 1; };",
      errors: [
        { messageId: "noGeneratorFunction" },
        { messageId: "noYieldExpression" },
      ],
    },
  ],
});

console.log("All tests passed!");
