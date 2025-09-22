/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['../../.eslintrc.cjs'],
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '*.d.ts'],
  globals: {
    // Vitest globals
    vi: 'readonly',
  },
  rules: {
    'no-unused-vars': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    'prefer-const': 'warn',
    'no-case-declarations': 'warn',
    'no-else-return': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'warn',
    'no-prototype-builtins': 'warn',
    'no-lonely-if': 'warn',
  },
};
