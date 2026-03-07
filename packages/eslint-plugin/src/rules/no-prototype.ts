/**
 * @fileoverview Rule to disallow prototype usage.
 *
 * BorisScript does not support prototype chains. This rule catches
 * any access to `.prototype` or `.__proto__` as well as calls to
 * `Object.getPrototypeOf`, `Object.setPrototypeOf`, and `Object.create`.
 */

import type { Rule } from "eslint";

/**
 * ESLint rule that reports an error when prototype-related patterns
 * are encountered.
 *
 * @example
 * // ❌ Invalid — accessing .prototype
 * Foo.prototype.bar = function() {};
 *
 * // ❌ Invalid — accessing .__proto__
 * obj.__proto__ = other;
 *
 * // ❌ Invalid — Object.create / Object.getPrototypeOf / Object.setPrototypeOf
 * var child = Object.create(parent);
 *
 * // ✅ Valid — use factory functions or plain objects
 * function createFoo() { return { bar: function() {} }; }
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow prototype usage (not supported in BorisScript)",
      recommended: true,
      url: "https://github.com/BorisType/BorisType/blob/main/packages/eslint-plugin/docs/rules/no-prototype.md",
    },
    schema: [],
    messages: {
      noPrototypeAccess:
        "Accessing .prototype is not supported in BorisScript. Use factory functions or plain objects instead.",
      noDunderProto:
        "Accessing .__proto__ is not supported in BorisScript. Use factory functions or plain objects instead.",
      noObjectPrototypeMethod:
        "{{name}} is not supported in BorisScript. Use factory functions or plain objects instead.",
    },
  },

  create(context) {
    /** Names of Object methods that manipulate prototypes. */
    const FORBIDDEN_OBJECT_METHODS = new Set([
      "create",
      "getPrototypeOf",
      "setPrototypeOf",
    ]);

    return {
      /**
       * Reports `.prototype` and `.__proto__` member access.
       * @example Foo.prototype.bar  /  obj.__proto__
       */
      MemberExpression(node) {
        const prop = node.property;

        if (!node.computed && prop.type === "Identifier") {
          if (prop.name === "prototype") {
            context.report({ node, messageId: "noPrototypeAccess" });
          } else if (prop.name === "__proto__") {
            context.report({ node, messageId: "noDunderProto" });
          }
        }

        // Computed access with string literal: obj["prototype"]
        if (
          node.computed &&
          prop.type === "Literal" &&
          (prop.value === "prototype" || prop.value === "__proto__")
        ) {
          context.report({
            node,
            messageId:
              prop.value === "prototype"
                ? "noPrototypeAccess"
                : "noDunderProto",
          });
        }
      },

      /**
       * Reports Object.create / Object.getPrototypeOf / Object.setPrototypeOf.
       */
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.object.type === "Identifier" &&
          callee.object.name === "Object" &&
          callee.property.type === "Identifier" &&
          FORBIDDEN_OBJECT_METHODS.has(callee.property.name)
        ) {
          context.report({
            node,
            messageId: "noObjectPrototypeMethod",
            data: {
              name: `Object.${callee.property.name}`,
            },
          });
        }
      },
    };
  },
};

export default rule;
