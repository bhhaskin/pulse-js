// eslint.config.js
import eslintPluginTs from '@typescript-eslint/eslint-plugin';
import parserTs from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: parserTs,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': eslintPluginTs
    },
    rules: {
      ...eslintPluginTs.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      '@typescript-eslint/explicit-module-boundary-types': 'off'
    }
  }
];