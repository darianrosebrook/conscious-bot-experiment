/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['eslint:recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // Prefer const over let (user rule)
    'prefer-const': 'error',

    // Early return / guard clauses (user rule)
    'no-else-return': 'error',
    'no-lonely-if': 'error',

    // Nullish coalescing (user rule)
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',

    // Safe defaults
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/prefer-as-const': 'error',

    // Professional commit style
    'no-console': 'warn',

    // Type safety
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js'],
};
