// 28/11 (sếp "hoàn hảo 10/10"): kiểm mã tự động — chạy trong GitHub Actions trước khi lên bản (npm run lint).
// Lỗi (error) = chặn: dùng biến chưa khai báo, gọi hook sai chỗ (React sập). Cảnh báo = nên dọn (biến thừa, thiếu phụ thuộc hook).
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

export default [
  { ignores: ["dist/**", "node_modules/**", "public/**", "supabase/**", "scripts/**", "coverage/**"] },
  {
    files: ["src/**/*.{js,jsx}", "tests/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, __RULES_HASH__: "readonly", __APP_VERSION__: "readonly", __BUILD_TIME__: "readonly" },
    },
    plugins: { "react-hooks": reactHooks, react },
    linterOptions: { reportUnusedDisableDirectives: "warn" },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { varsIgnorePattern: "^(_|React$)", args: "none", caughtErrors: "none" }],
      "react/jsx-uses-vars": "error", // biến chỉ dùng trong JSX (<Comp />) không bị báo thừa
      "react/jsx-no-undef": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  { files: ["tests/**/*.{js,jsx}", "*.config.{js,mjs}"], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
