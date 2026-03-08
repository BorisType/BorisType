/**
 * @fileoverview Rule to disallow async/await syntax.
 *
 * BorisScript does not support async/await and never will.
 * This rule prevents their usage at the source level.
 */

import type { Rule } from "eslint";

/**
 * ESLint rule that reports an error when async functions or
 * await expressions are encountered.
 *
 * @example
 * // ❌ Invalid - async function declaration
 * async function fetchData() {}
 *
 * // ❌ Invalid - async arrow function
 * const fn = async () => {};
 *
 * // ❌ Invalid - await expression
 * await somePromise;
 *
 * // ✅ Valid - use callbacks or synchronous code
 * function fetchData(callback) {
 *   // ...
 *   callback(result);
 * }
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow async/await syntax (not supported in BorisScript)",
      recommended: true,
      url: "https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/docs/rules/no-async-await.md",
    },
    schema: [],
    messages: {
      noAsyncFunction:
        "Async functions are not supported in BorisScript. Use callbacks or synchronous code instead.",
      noAwaitExpression:
        "Await expressions are not supported in BorisScript. Use callbacks or synchronous code instead.",
      noForAwaitOf: "For-await-of loops are not supported in BorisScript.",
    },
  },

  create(context) {
    /**
     * Reports async function if it has async modifier.
     */
    function checkAsyncFunction(node: Rule.Node & { async?: boolean }) {
      if (node.async) {
        context.report({
          node,
          messageId: "noAsyncFunction",
        });
      }
    }

    return {
      /**
       * Reports async function declarations.
       * @example async function foo() {}
       */
      FunctionDeclaration: checkAsyncFunction,

      /**
       * Reports async function expressions.
       * @example const fn = async function() {}
       */
      FunctionExpression: checkAsyncFunction,

      /**
       * Reports async arrow functions.
       * @example const fn = async () => {}
       */
      ArrowFunctionExpression: checkAsyncFunction,

      /**
       * Reports await expressions.
       * @example await promise
       */
      AwaitExpression(node) {
        context.report({
          node,
          messageId: "noAwaitExpression",
        });
      },

      /**
       * Reports for-await-of loops.
       * @example for await (const x of asyncIterable) {}
       */
      ForOfStatement(node: Rule.Node & { await?: boolean }) {
        if (node.await) {
          context.report({
            node,
            messageId: "noForAwaitOf",
          });
        }
      },
    };
  },
};

export default rule;
