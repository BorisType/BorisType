import boristypePlugin from "@boristype/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
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
  {
    files: ["src/prototype/**/*.ts"],
    rules: {
      "@boristype/no-class-declaration": "off",
      "@boristype/no-prototype": "off",
    },
  },
];
