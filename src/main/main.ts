/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
// 产品改名会改变 userData 路径，这一句必须排在所有会读 userData 的 import 之前。
import './startup/migrate-userdata';
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, Menu } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { resolveHtmlPath } from './util';

// speakspace-local ipc
import './ipc/audio-ipc';
import './ipc/model-management-ipc';
import './ipc/workflow-ipc';
import './ipc/settings-ipc';
import './ipc/recommendation-ipc';
import './ipc/runtime-ipc';
import './ipc/transcription-ipc';
import './ipc/llm-ipc';
import './ipc/ask-ai-ipc';
import './ipc/tts-ipc';
import './ipc/semantic-ipc';
import './ipc/agent-ipc';
import './ipc/export-ipc';
// 工作空间 IPC 在主进程启动时注册。 / Register Workspace IPC when the main process starts.
import './ipc/workspace-ipc';
import './ipc/dashboard-ipc';
import './ipc/trash-ipc';
import './ipc/knowledge-generation-ipc';
import { setBackgroundController } from './ipc/background-ipc';
import { BackgroundController } from './background/BackgroundController';
import { TrayController } from './background/TrayController';
import { SettingsService } from './settings/SettingsService';
import { GarbageCollectionService } from './startup/GarbageCollectionService';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn('Update check failed:', err);
    });
  }
}

let mainWindow: BrowserWindow | null = null;
let background: BackgroundController | null = null;

/**
 * 单实例锁。
 *
 * 开了托盘常驻之后，窗口藏起来的时候再点一次桌面图标会起第二个进程，
 * 两个进程抢同一个 sqlite 文件。这里直接把后来的挡掉，转而唤起已有窗口。
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  // 保留开发快捷键，但不自动打开 DevTools，避免挤压应用预览布局。
  require('electron-debug').default({ showDevTools: false });
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  // 仅在明确请求时安装开发扩展，避免扩展缓存故障阻止普通开发预览。
  if (isDebug && process.env.UPGRADE_EXTENSIONS === 'true') {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  // 应用内已经提供完整导航，移除 Electron 默认的 File / View / Help 菜单。
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    autoHideMenuBar: true,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
      // 窗口藏到托盘后 Chromium 会把定时器和动画降频，录音计时、
      // 波形、转录进度都会卡住——后台常驻的前提就是别节流。
      backgroundThrottling: false,
    },
  });

  // 托盘 / 全局快捷键 / 关窗策略。窗口只隐藏不销毁：录音用的是渲染层的
  // MediaRecorder，窗口没了就录不成。
  background = new BackgroundController(
    new SettingsService(),
    new TrayController(getAssetPath('icon.png')),
  );
  background.attachWindow(mainWindow);
  setBackgroundController(background);
  background.apply();

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      // 先最大化再 show：窗口不会先以 1024x728 闪一下再撑开。
      // 上面的 width/height 仍然有用，作为用户取消最大化后的还原尺寸。
      mainWindow.maximize();
      mainWindow.show();
    }
  });

  // 主窗口加载完之后再预热浮窗：启动阶段先把主界面给出来，
  // 之后按快捷键才不会卡在「现建现加载」上。
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => background?.prewarmHud(), 1500);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // 托盘还驻留着就是「后台运行」，不能退；否则沿用原来的约定：
  // macOS 留在内存里，其它平台关完窗口就退出。
  if (background?.isBackgroundActive() && !background.isQuitting()) return;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 第二次启动（点桌面图标、打开文件关联）时唤起已有窗口，而不是再开一个
app.on('second-instance', () => {
  background?.showWindow();
});

// 菜单退出 / 系统关机：先标记为「真的要退」，close 拦截才会放行
app.on('before-quit', () => {
  background?.beginQuit();
  background?.dispose();
});

if (gotSingleInstanceLock) {
  app
    .whenReady()
    .then(() => {
      createWindow();
      // Run background cleanup task
      new GarbageCollectionService().runGarbageCollection();

      app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow === null) createWindow();
        else background?.showWindow();
      });
    })
    .catch(console.log);
}
