/**
 * Base webpack config used across other specific configs
 */

import path from 'path';
import webpack from 'webpack';
import TsconfigPathsPlugins from 'tsconfig-paths-webpack-plugin';
import webpackPaths from './webpack.paths';
// release/app 不是已安装的依赖，只能按相对路径读；改成包名会导致解析失败。
// eslint-disable-next-line import/no-relative-packages
import { dependencies as externals } from '../../release/app/package.json';

const configuration: webpack.Configuration = {
  externals: [...Object.keys(externals || {})],

  stats: 'errors-only',

  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            // Remove this line to enable type checking in webpack builds
            transpileOnly: true,
            compilerOptions: {
              module: 'nodenext',
              moduleResolution: 'nodenext',
            },
          },
        },
      },
    ],
  },

  output: {
    path: webpackPaths.srcPath,
    // https://github.com/webpack/webpack/issues/1114
    library: { type: 'commonjs2' },
  },

  /**
   * Determine the array of extensions that should be used to resolve modules.
   */
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
    modules: [webpackPaths.srcPath, 'node_modules'],
    // docx's CommonJS bundle contains a dynamic require that webpack cannot
    // statically analyse. Its ESM build exposes the same public API and is
    // safe to bundle in both the development and production main processes.
    alias: {
      docx$: path.join(
        webpackPaths.rootPath,
        'node_modules/docx/dist/index.mjs',
      ),
    },
    // There is no need to add aliases here, the paths in tsconfig get mirrored
    plugins: [new TsconfigPathsPlugins()],
  },

  plugins: [new webpack.EnvironmentPlugin({ NODE_ENV: 'production' })],
};

export default configuration;
