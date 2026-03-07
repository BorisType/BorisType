/**
 * @fileoverview Rule to disallow class declarations.
 *
 * BorisScript does not support ES6 classes, so this rule prevents
 * their usage at the source level to catch errors early.
 *
 * Note: prototype is also not supported. Support for classes and
 * prototype is planned for the future.
 */

import type { Rule } from "eslint";

/**
 * ESLint rule that reports an error when a class declaration or
 * class expression is encountered.
 *
 * @example
 * // ❌ Invalid - class declaration
 * class Foo {
 *   bar() {}
 * }
 *
 * // ❌ Invalid - class expression
 * const Baz = class {
 *   qux() {}
 * };
 *
 * // ✅ Valid - use factory functions or object literals
 * function createFoo() {
 *   return { bar: function() {} };
 * }
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow class declarations (not supported in BorisScript)",
      recommended: true,
      url: "https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/docs/rules/no-class-declaration.md",
    },
    schema: [],
    messages: {
      noClassDeclaration:
        "Class declarations are not supported in BorisScript. Use factory functions instead.",
      noClassExpression:
        "Class expressions are not supported in BorisScript. Use factory functions instead.",
    },
  },

  create(context) {
    return {
      /**
       * Reports class declarations.
       * @example class Foo {}
       */
      ClassDeclaration(node) {
        context.report({
          node,
          messageId: "noClassDeclaration",
        });
      },

      /**
       * Reports class expressions.
       * @example const Foo = class {}
       */
      ClassExpression(node) {
        context.report({
          node,
          messageId: "noClassExpression",
        });
      },
    };
  },
};

export default rule;
