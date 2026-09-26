import { BrowserWindow, ipcMain } from 'electron';
import { RuntimeStatusService } from '../runtime/RuntimeStatusService';
import WhisperRuntimeInstaller from '../transcription/WhisperRuntimeInstaller';
import OllamaRuntimeInstaller from '../llm/OllamaRuntimeInstaller';
import TTSRuntimeInstaller from '../tts/TTSRuntimeInstaller';
import FfmpegInstaller from '../runtime/FfmpegInstaller';
import RuntimeUninstallService, {
  UninstallTarget,
} from '../runtime/RuntimeUninstallService';
import ollamaServerController from '../llm/OllamaRuntime';
import OllamaEmbeddingService from '../semantic/OllamaEmbeddingService';

const runtimeStatusService = new RuntimeStatusService();
const runtimeUninstallService = new RuntimeUninstallService();
const whisperRuntimeInstaller = new WhisperRuntimeInstaller();
const ollamaRuntimeInstaller = new OllamaRuntimeInstaller();
const ttsRuntimeInstaller = new TTSRuntimeInstaller();
const ffmpegInstaller = new FfmpegInstaller();
const embeddingService = new OllamaEmbeddingService();

/** 启动本地模型服务的等待上限，超时就按当前状态如实判定。 */
const OLLAMA_START_TIMEOUT_MS = 20000;

// Renderer 只读取汇总状态，实际文件检查保留在 Electron 主进程。
ipcMain.handle('Runtime:getStatus', () => runtimeStatusService.getStatus());

/**
 * 开工前检查专用：先把 Ollama 拉起来再读状态。
 *
 * Runtime:getStatus 和 Semantic:getStatus 都是纯读取，服务器没起来时
 * languageModel.serverRunning 和 embedding.serverAvailable 一定是 false，
 * 于是「模型其实装好了却报未就绪、去一趟模型管理页回来又好了」——
 * 因为模型管理页顺手调了 ensureRunning。这里统一先启动再判断。
 */
ipcMain.handle('Runtime:getReadiness', async () => {
  // 起不来也要继续：让检查如实报告未就绪，而不是整个失败。
  // 也不能无限等——卡住的话门禁页会一直转圈，用户没有任何出路。
  await Promise.race([
    ollamaServerController.ensureRunning().catch(() => undefined),
    new Promise((resolve) => {
      setTimeout(resolve, OLLAMA_START_TIMEOUT_MS);
    }),
  ]);
  // 两个 getStatus 都是异步的，必须先 await 再放进返回对象：
  // 未决的 Promise 无法通过 IPC 的结构化克隆，会直接报
  // “An object could not be cloned”。
  const [runtime, embedding] = await Promise.all([
    runtimeStatusService.getStatus(),
    embeddingService.getStatus(),
  ]);
  return { runtime, embedding };
});

ipcMain.handle('Runtime:installWhisper', () =>
  whisperRuntimeInstaller.install((progress) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('Runtime:installProgress', progress);
    });
  }),
);

ipcMain.handle('Runtime:installOllama', () =>
  ollamaRuntimeInstaller.install((progress) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('Runtime:installOllamaProgress', progress);
    });
  }),
);

ipcMain.handle('Runtime:installTTS', () =>
  ttsRuntimeInstaller.install((progress) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('Runtime:installTTSProgress', progress);
    });
  }),
);

// 只允许卸载应用自己下载到 userData 的运行时，系统安装的副本由服务层拒绝。
ipcMain.handle('Runtime:uninstall', (_event, target: UninstallTarget) =>
  runtimeUninstallService.uninstall(target),
);

ipcMain.handle('Runtime:installFfmpeg', () =>
  ffmpegInstaller.install((progress) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('Runtime:installFfmpegProgress', progress);
    });
  }),
);
