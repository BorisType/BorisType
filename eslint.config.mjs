import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import boristypePlugin from "@boristype/eslint-plugin";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/build/**",
      "**/dist/**",
      "**/node_modules/**",
      "docs/**",
      "schemas/**",
      "scripts/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "**/*.d.ts",
      "packages/bt-ir/example/**/*",
      "packages/botest/src/borisscript/patch.ts",
      "examples/**/*",
      "tests/**/*",
    ],
  },

  // All .ts files — parser + basic quality rules
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // BorisType code — @boristype/eslint-plugin rules
  // BorisScript only supports var, so no-var is off
  {
    files: ["examples/**/src/**/*.ts", "tests/src/**/*.ts"],
    plugins: {
      "@boristype": boristypePlugin,
    },
    rules: {
      "@boristype/no-async-await": "error",
      "@boristype/no-generators": "error",
      "@boristype/no-prototype": "error",
      "@boristype/no-class-declaration": "error",
    },
  },

  // Override: tests/prototype allows classes and prototype
  {
    files: ["tests/src/prototype/**/*.ts"],
    rules: {
      "@boristype/no-class-declaration": "off",
      "@boristype/no-prototype": "off",
    },
  },

  // Disable formatting rules — Prettier handles formatting
  eslintConfigPrettier,
);
