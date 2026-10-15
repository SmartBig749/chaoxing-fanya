module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  plugins: ['react', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  ignorePatterns: ['dist', '.build-check', 'node_modules', 'scripts', 'tests'],
  rules: {
    // 使用 Vite 的自动 JSX runtime，不需要显式引入 React
    'react/react-in-jsx-scope': 'off',
    // 纯 JS 项目，不做 propTypes 校验
    'react/prop-types': 'off',
    // 允许以 _ 前缀表示「有意未使用」
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
