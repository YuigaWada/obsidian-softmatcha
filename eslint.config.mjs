import {defineConfig} from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
export default defineConfig([
 {ignores:['node_modules/**','main.js','dist/**','assets/**','rust/**','server/**','scripts/**','tests/**','*.mjs']},
 ...obsidianmd.configs.recommended,
 {files:['src/**/*.ts'],languageOptions:{parserOptions:{projectService:true}}},
]);
