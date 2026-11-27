import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["dist/**", "coverage/**", ".wrangler/**", ".npm-cache/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        AbortSignal: "readonly",
        Buffer: "readonly",
        require: "readonly",
        module: "readonly",
      },
    },
  },
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
);
