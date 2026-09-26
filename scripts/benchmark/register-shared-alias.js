/* eslint-disable no-underscore-dangle */

/**
 * ts-node 不会自行解析 tsconfig 的 @shared/* 路径。
 * 评测脚本预加载这个很小的映射层，才能直接复用主进程源码而不是复制一份实现。
 */
const Module = require('module');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveSharedAlias(
  request,
  parent,
  isMain,
  options,
) {
  const mapped = request.startsWith('@shared/')
    ? path.join(projectRoot, 'src', 'shared', request.slice('@shared/'.length))
    : request;
  return originalResolveFilename.call(this, mapped, parent, isMain, options);
};
