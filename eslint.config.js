// Flat ESLint config (ESLint 9+). Keeps rules minimal but strict on type-safety,
// since this codebase leans on TypeScript to enforce the Clean Architecture
// boundaries (e.g. domain layer must not import infrastructure).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Type-aware linting only for the files actually covered by
    // tsconfig.json's `include` — root-level *.config.js/ts files aren't
    // part of that TS project and don't need (or support) type-aware rules.
    files: ['src/**/*.ts', 'mock-services/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  prettier,
);
