/**
 * @fileoverview Tests for no-class-declaration rule.
 */

import { RuleTester } from "eslint";
import rule from "./no-class-declaration";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("no-class-declaration", rule, {
  valid: [
    // Regular functions are allowed
    "function Foo() {}",

    // Object literals are allowed
    "const obj = { method() {} };",

    // Factory functions are allowed
    "function createFoo() { return { bar: function() {} }; }",

    // Arrow functions are allowed
    "const fn = () => {};",

    // Regular function expressions
    "const fn = function() {};",
  ],

  invalid: [
    // Class declaration
    {
      code: "class Foo {}",
      errors: [{ messageId: "noClassDeclaration" }],
    },

    // Class declaration with methods
    {
      code: `
        class Foo {
          bar() {}
          baz() {}
        }
      `,
      errors: [{ messageId: "noClassDeclaration" }],
    },

    // Class declaration with extends
    {
      code: "class Bar extends Foo {}",
      errors: [{ messageId: "noClassDeclaration" }],
    },

    // Class expression
    {
      code: "const Foo = class {};",
      errors: [{ messageId: "noClassExpression" }],
    },

    // Named class expression
    {
      code: "const Foo = class Bar {};",
      errors: [{ messageId: "noClassExpression" }],
    },

    // Class expression in object
    {
      code: "const obj = { Foo: class {} };",
      errors: [{ messageId: "noClassExpression" }],
    },

    // Multiple classes
    {
      code: `
        class Foo {}
        class Bar {}
      `,
      errors: [
        { messageId: "noClassDeclaration" },
        { messageId: "noClassDeclaration" },
      ],
    },
  ],
});

console.log("All tests passed!");
