/**
 * @fileoverview Tests for no-async-await rule.
 */

import { RuleTester } from "eslint";
import rule from "./no-async-await";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("no-async-await", rule, {
  valid: [
    // Regular function declaration
    "function fetchData() {}",

    // Regular function expression
    "const fn = function() {};",

    // Regular arrow function
    "const fn = () => {};",

    // Callback pattern
    `
      function fetchData(callback) {
        setTimeout(function() {
          callback(null, 'data');
        }, 100);
      }
    `,

    // Method shorthand
    "const obj = { method() {} };",

    // Regular for-of loop
    "for (const x of [1, 2, 3]) {}",
  ],

  invalid: [
    // Async function declaration
    {
      code: "async function fetchData() {}",
      errors: [{ messageId: "noAsyncFunction" }],
    },

    // Async function expression
    {
      code: "const fn = async function() {};",
      errors: [{ messageId: "noAsyncFunction" }],
    },

    // Async arrow function
    {
      code: "const fn = async () => {};",
      errors: [{ messageId: "noAsyncFunction" }],
    },

    // Async arrow function with body
    {
      code: "const fn = async () => { return 1; };",
      errors: [{ messageId: "noAsyncFunction" }],
    },

    // Async method in object
    {
      code: "const obj = { async method() {} };",
      errors: [{ messageId: "noAsyncFunction" }],
    },

    // Await expression (also triggers async function error)
    {
      code: "async function foo() { await bar(); }",
      errors: [{ messageId: "noAsyncFunction" }, { messageId: "noAwaitExpression" }],
    },

    // Multiple await expressions
    {
      code: `
        async function foo() {
          await bar();
          await baz();
        }
      `,
      errors: [
        { messageId: "noAsyncFunction" },
        { messageId: "noAwaitExpression" },
        { messageId: "noAwaitExpression" },
      ],
    },

    // For-await-of loop
    {
      code: "async function foo() { for await (const x of iter) {} }",
      errors: [{ messageId: "noAsyncFunction" }, { messageId: "noForAwaitOf" }],
    },

    // Async IIFE
    {
      code: "(async () => { await fetch(); })();",
      errors: [{ messageId: "noAsyncFunction" }, { messageId: "noAwaitExpression" }],
    },
  ],
});

console.log("All tests passed!");
