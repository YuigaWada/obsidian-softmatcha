import { fileURLToPath } from "node:url";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      "main.js",
      "dist/**",
      ".local/assets/**",
      "crates/**",
      "dev/native-reference/**",
      "scripts/**",
      "tests/**",
      "*.mjs",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./config/tsconfig.json",
        tsconfigRootDir: fileURLToPath(new URL("..", import.meta.url)),
      },
    },
  },
]);
