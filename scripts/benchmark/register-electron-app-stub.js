/* eslint-disable no-underscore-dangle */

/**
 * 在 ELECTRON_RUN_AS_NODE=1 下 require('electron') 只会拿到可执行文件路径，
 * 不是真正的 app API——但真正启动 Electron GUI 主进程去跑这个一次性安装脚本
 * 又会因为 .ts 入口触发 ESM 加载器而报错（绕不开 -r 挂的 ts-node 钩子）。
 *
 * 这个脚本只是为了拿 app.getPath('userData')，跟真正启动 Electron 完全无关，
 * 所以直接按 Electron 在 Windows 上的真实规则伪造这一个方法，省得启动整个
 * GUI 主进程。目录规则见 Electron 文档：%APPDATA%/<productName>。
 */
const Module = require('module');
const os = require('os');
const path = require('path');

const packageJson = require('../../package.json');

const productName = packageJson.productName || packageJson.name;

function resolveUserDataPath() {
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      productName,
    );
  }
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      productName,
    );
  }
  return path.join(os.homedir(), '.config', productName);
}

const userDataPath = resolveUserDataPath();

const fakeElectronApp = {
  getPath(name) {
    if (name === 'userData') return userDataPath;
    throw new Error(
      `register-electron-app-stub: 未实现 app.getPath('${name}')，这个存根只支持 'userData'。`,
    );
  },
};

const originalLoad = Module._load;
Module._load = function loadWithElectronStub(request, parent, isMain) {
  if (request === 'electron') {
    return { app: fakeElectronApp };
  }
  return originalLoad.call(this, request, parent, isMain);
};
