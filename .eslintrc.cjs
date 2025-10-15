/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['eslint:recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  globals: {
    // Jest/Vitest globals
    jest: 'readonly',
    describe: 'readonly',
    it: 'readonly',
    test: 'readonly',
    expect: 'readonly',
    beforeEach: 'readonly',
    afterEach: 'readonly',
    beforeAll: 'readonly',
    afterAll: 'readonly',
    vi: 'readonly',

    // Browser globals
    fetch: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    window: 'readonly',
    document: 'readonly',
    global: 'readonly',

    // Node.js globals
    process: 'readonly',
    Buffer: 'readonly',
    require: 'readonly',
    module: 'readonly',

    // Web APIs
    Response: 'readonly',
    Request: 'readonly',
    RequestInit: 'readonly',
    Headers: 'readonly',
    URL: 'readonly',
    AbortSignal: 'readonly',
    ReadableStream: 'readonly',
    TextEncoder: 'readonly',
    WebSocket: 'readonly',
    EventSource: 'readonly',
    HTMLVideoElement: 'readonly',
    HTMLCanvasElement: 'readonly',
    HTMLIFrameElement: 'readonly',
    HTMLSelectElement: 'readonly',
    HTMLElement: 'readonly',
    Event: 'readonly',
    Image: 'readonly',

    // NodeJS types
    NodeJS: 'readonly',
  },
  rules: {
    // Prefer const over let (user rule)
    'prefer-const': 'error',

    // Early return / guard clauses (user rule)
    'no-else-return': 'error',
    'no-lonely-if': 'error',

    // Nullish coalescing (user rule) - disabled for now due to parser issues
    // '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',

    // Safe defaults
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/prefer-as-const': 'error',

    // Professional commit style
    // 'no-console': 'warn',

    // Type safety
    // '@typescript-eslint/no-explicit-any': 'warn',
    // '@typescript-eslint/no-unused-vars': 'error',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.js',
    '*.cjs',
    'packages/*/dist/',
  ],
};
