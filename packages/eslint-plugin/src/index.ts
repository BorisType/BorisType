/**
 * @fileoverview ESLint plugin with custom rules for BorisType/BorisScript development.
 *
 * This plugin provides rules that help enforce BorisScript limitations
 * at the TypeScript source level, before transpilation.
 */

import noAsyncAwait from "./rules/no-async-await";
import noClassDeclaration from "./rules/no-class-declaration";
import noGenerators from "./rules/no-generators";
import noPrototype from "./rules/no-prototype";

/**
 * All rules provided by this plugin.
 */
const rules = {
  "no-async-await": noAsyncAwait,
  "no-class-declaration": noClassDeclaration,
  "no-generators": noGenerators,
  "no-prototype": noPrototype,
};

/**
 * Recommended configuration preset.
 * Enables all rules as errors.
 */
const configs = {
  recommended: {
    plugins: ["@boristype"],
    rules: {
      "@boristype/no-async-await": "error",
      "@boristype/no-generators": "error",
      "@boristype/no-prototype": "error",
      "@boristype/no-class-declaration": "error",
    },
  },
};

export = { rules, configs };
