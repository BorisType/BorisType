/**
 * @fileoverview Rule to disallow generator functions and yield expressions.
 *
 * BorisScript does not support generators. This rule prevents their
 * usage at the source level.
 */

import type { Rule } from "eslint";

/**
 * ESLint rule that reports an error when generator functions or
 * yield expressions are encountered.
 *
 * @example
 * // ❌ Invalid — generator function declaration
 * function* gen() { yield 1; }
 *
 * // ❌ Invalid — generator method
 * var obj = { *gen() { yield 1; } };
 *
 * // ✅ Valid — return an array or use callbacks
 * function getItems() { return [1, 2, 3]; }
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow generator functions and yield (not supported in BorisScript)",
      recommended: true,
      url: "https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/docs/rules/no-generators.md",
    },
    schema: [],
    messages: {
      noGeneratorFunction: "Generator functions are not supported in BorisScript. Use arrays or callbacks instead.",
      noYieldExpression: "Yield expressions are not supported in BorisScript.",
    },
  },

  create(context) {
    /**
     * Reports a function node if it is a generator.
     */
    function checkGenerator(node: Rule.Node & { generator?: boolean }) {
      if (node.generator) {
        context.report({
          node,
          messageId: "noGeneratorFunction",
        });
      }
    }

    return {
      /**
       * Reports generator function declarations.
       * @example function* gen() {}
       */
      FunctionDeclaration: checkGenerator,

      /**
       * Reports generator function expressions.
       * @example var gen = function*() {}
       */
      FunctionExpression: checkGenerator,

      /**
       * Reports yield expressions.
       * @example yield value
       */
      YieldExpression(node) {
        context.report({
          node,
          messageId: "noYieldExpression",
        });
      },
    };
  },
};

export default rule;
