const vitest = require('eslint-plugin-vitest');

module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules'],
  overrides: [
    {
      files: ['tests/**/*.ts'],
      env: {
        'vitest/env': true
      },
      plugins: ['vitest'],
      rules: vitest.configs.recommended.rules
    }
  ]
};
