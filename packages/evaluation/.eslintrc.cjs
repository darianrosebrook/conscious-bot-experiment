/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['../../.eslintrc.cjs'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.js',
    'src/__tests__/complex-reasoning-evaluation.test.ts',
    'src/__tests__/phase5-integration.test.ts',
  ],
  rules: {
    'no-unused-vars': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    'prefer-const': 'warn',
    'no-case-declarations': 'warn',
    'no-else-return': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'warn',
    'no-prototype-builtins': 'warn',
    'no-dupe-class-members': 'warn',
  },
};
