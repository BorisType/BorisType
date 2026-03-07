/**
 * @fileoverview Tests for no-prototype rule.
 */

import { RuleTester } from "eslint";
import rule from "./no-prototype";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
});

ruleTester.run("no-prototype", rule, {
  valid: [
    // Regular object literal
    "var obj = { foo: 1 };",

    // Factory function
    "function createFoo() { return { bar: function() {} }; }",

    // Property named 'prototype' in an object literal (not member access)
    'var obj = { prototype: 1 };',

    // Regular method call on Object
    "Object.keys(obj);",
    "Object.assign({}, obj);",

    // Computed property with non-prototype string
    'obj["foo"];',
  ],

  invalid: [
    // .prototype access
    {
      code: "Foo.prototype.bar = function() {};",
      errors: [{ messageId: "noPrototypeAccess" }],
    },

    // .prototype read
    {
      code: "var proto = Foo.prototype;",
      errors: [{ messageId: "noPrototypeAccess" }],
    },

    // .__proto__ access
    {
      code: "obj.__proto__ = other;",
      errors: [{ messageId: "noDunderProto" }],
    },

    // .__proto__ read
    {
      code: "var p = obj.__proto__;",
      errors: [{ messageId: "noDunderProto" }],
    },

    // Computed .prototype access
    {
      code: 'Foo["prototype"].bar = function() {};',
      errors: [{ messageId: "noPrototypeAccess" }],
    },

    // Computed .__proto__ access
    {
      code: 'obj["__proto__"] = other;',
      errors: [{ messageId: "noDunderProto" }],
    },

    // Object.create
    {
      code: "var child = Object.create(parent);",
      errors: [{ messageId: "noObjectPrototypeMethod" }],
    },

    // Object.getPrototypeOf
    {
      code: "var proto = Object.getPrototypeOf(obj);",
      errors: [{ messageId: "noObjectPrototypeMethod" }],
    },

    // Object.setPrototypeOf
    {
      code: "Object.setPrototypeOf(child, parent);",
      errors: [{ messageId: "noObjectPrototypeMethod" }],
    },

    // Multiple prototype violations
    {
      code: `
        Foo.prototype.bar = 1;
        Foo.prototype.baz = 2;
      `,
      errors: [
        { messageId: "noPrototypeAccess" },
        { messageId: "noPrototypeAccess" },
      ],
    },
  ],
});

console.log("All tests passed!");
