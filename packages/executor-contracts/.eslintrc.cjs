/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['../../.eslintrc.cjs'],
  parserOptions: {
    project: ['./tsconfig.json', './tsconfig.test.json'],
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js'],
  overrides: [
    {
      files: ['src/__tests__/**/*'],
      rules: {
        'no-unused-vars': 'off', // Disable for test files
        '@typescript-eslint/no-unused-vars': 'off', // Disable for test files
      },
    },
  ],
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-non-null-assertion': 'warn',
    'prefer-const': 'warn',
    'no-case-declarations': 'warn',
    'no-else-return': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'warn',
    'no-prototype-builtins': 'warn',
    'no-dupe-class-members': 'warn',
  },
};
