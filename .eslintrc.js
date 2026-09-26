module.exports = {
  extends: 'erb',
  plugins: ['@typescript-eslint'],
  rules: {
    // A temporary hack related to IDE not resolving correct package.json
    'import/no-extraneous-dependencies': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/no-import-module-exports': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    // 本项目统一用具名导出：多数模块导出的是一组协作的函数与类型，
    // 强制默认导出只会逼出一堆无意义的 inline disable。
    'import/prefer-default-export': 'off',
    // React 19 已经移除函数组件的 defaultProps，可选属性由 TS 类型表达。
    'react/require-default-props': 'off',
    // 组件封装大量依赖 props 展开，这是本项目既定写法。
    'react/jsx-props-no-spreading': 'off',
    // function 声明与箭头函数并存，不做统一强制。
    'react/function-component-definition': 'off',
    // 本项目习惯 .catch(...).finally(...) 收尾，finally 同样算完整终结。
    'promise/catch-or-return': ['error', { allowFinally: true }],
    // React 19 已经不再在运行时读取 propTypes，组件契约一律由 TS 类型表达；
    // 为剩下的两个 .jsx 文件补一份运行时被忽略的声明没有意义。
    'react/prop-types': 'off',
    // 可拖动分隔条是 ARIA 的 window splitter，本来就必须可聚焦才能用键盘调整。
    'jsx-a11y/no-noninteractive-tabindex': [
      'error',
      { tags: [], roles: ['separator'], allowExpressionValues: true },
    ],
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        // TypeScript 自己会检查未定义标识符，而 no-undef 认不出
        // NodeJS / NodeRequire 这类 ambient 类型，在 TS 文件里必然误报。
        'no-undef': 'off',
      },
    },
    {
      // 进程边界：渲染层曾经直接 import 主进程实现文件拿类型（一度多达 32 处），
      // 其中 RuntimeStatusService 顶层就 import 了 fs，只是靠 TS 类型擦除侥幸没炸。
      // 跨进程共享的东西一律放 src/shared，唯一例外是 preload 暴露的 IPC 契约。
      files: [
        'src/renderer/**/*.ts',
        'src/renderer/**/*.tsx',
        'src/renderer/**/*.jsx',
      ],
      excludedFiles: ['src/renderer/preload.d.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/main/**', '@main/**'],
                message:
                  '渲染进程不要直接 import 主进程文件。跨进程共享的类型放 src/shared（用 @shared/*），运行时能力走 preload 暴露的 IPC。',
              },
            ],
          },
        ],
      },
    },
  ],
  env: {
    browser: true,
    node: true,
    es2022: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  settings: {
    'import/resolver': {
      // See https://github.com/benmosher/eslint-plugin-import/issues/1396#issuecomment-575727774 for line below
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/'],
      },
      webpack: {
        config: require.resolve('./.erb/configs/webpack.config.eslint.ts'),
      },
      typescript: {},
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
};
