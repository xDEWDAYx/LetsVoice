import { BrowserWindow, ipcMain } from 'electron';
import type {
  ManagedModelType,
  ModelDownloadProgressEvent,
} from '@shared/types/ModelManagementTypes';

import { STTModelManager } from '../AI-module/STTModelManager';
import { LLMModelManager } from '../AI-module/LLMModelManager';
import TTSModelManager from '../AI-module/TTSModelManager';
import ollamaServerController from '../llm/OllamaRuntime';
import { ttsService } from '../tts/TTSRuntimeCoordinator';

const sttModelManager = new STTModelManager();
const llmModelManager = new LLMModelManager();
const ttsModelManager = new TTSModelManager();
const activeDownloads = new Map<string, Promise<void>>();

type RawDownloadProgress = {
  message?: string;
  status?: string;
  receivedBytes?: number;
  completed?: number;
  totalBytes?: number | null;
  total?: number;
};

function unsupportedModelType(modelType: string): never {
  throw new Error(`不支持的模型类型 / Unsupported model type: ${modelType}`);
}

function sendDownloadProgress(
  modelType: ManagedModelType,
  modelId: string,
  progress: RawDownloadProgress,
): void {
  const event: ModelDownloadProgressEvent = {
    modelType,
    modelId,
    message: progress.message ?? progress.status ?? '正在下载…',
    receivedBytes: progress.receivedBytes ?? progress.completed ?? 0,
    totalBytes: progress.totalBytes ?? progress.total ?? null,
  };
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('ModelManagement:downloadProgress', event);
  });
}

async function performModelDownload(
  modelType: ManagedModelType,
  modelId: string,
): Promise<void> {
  const onProgress = (progress: RawDownloadProgress) =>
    sendDownloadProgress(modelType, modelId, progress);

  switch (modelType) {
    case 'stt':
      return sttModelManager.downloadModel(modelId, onProgress);
    case 'llm':
      await ollamaServerController.ensureRunning();
      return llmModelManager.downloadModel(modelId, onProgress);
    case 'tts':
      return ttsModelManager.downloadModel(modelId, onProgress);
    default:
      return unsupportedModelType(modelType);
  }
}

/** 不同模型可并发；同一模型的重复请求复用正在执行的 Promise。 */
function downloadModelOnce(
  modelType: ManagedModelType,
  modelId: string,
): Promise<void> {
  const key = `${modelType}:${modelId}`;
  const current = activeDownloads.get(key);
  if (current) return current;

  const download = performModelDownload(modelType, modelId);
  activeDownloads.set(key, download);
  const clear = () => {
    if (activeDownloads.get(key) === download) activeDownloads.delete(key);
  };
  download.then(clear).catch(clear);
  return download;
}

ipcMain.handle(
  'ModelManagement:getModelList',
  async (_event, modelType: string) => {
    switch (modelType) {
      case 'stt':
        return sttModelManager.getModelList();
      case 'llm': {
        // 页面读取模型时尝试启动已安装的 Ollama；缺少运行时仍返回目录供 UI 展示。
        await ollamaServerController.ensureRunning().catch(() => undefined);
        return llmModelManager.getModelList();
      }
      case 'tts':
        return ttsModelManager.getModelList();
      default:
        return unsupportedModelType(modelType);
    }
  },
);

ipcMain.handle(
  'ModelManagement:downloadModel',
  async (_event, modelType: string, modelId: string) => {
    if (modelType !== 'stt' && modelType !== 'tts' && modelType !== 'llm') {
      return unsupportedModelType(modelType);
    }
    return downloadModelOnce(modelType, modelId);
  },
);

ipcMain.handle(
  'ModelManagement:deleteModel',
  async (_event, modelType: string, modelId: string) => {
    switch (modelType) {
      case 'stt':
        return sttModelManager.deleteModel(modelId);
      case 'llm':
        await ollamaServerController.ensureRunning();
        return llmModelManager.deleteModel(modelId);
      case 'tts':
        return ttsModelManager.deleteModel(modelId);
      default:
        return unsupportedModelType(modelType);
    }
  },
);

ipcMain.handle(
  'ModelManagement:activateModel',
  async (_event, modelType: string, modelId: string) => {
    switch (modelType) {
      case 'stt':
        return sttModelManager.activateModel(modelId);
      case 'llm':
        await ollamaServerController.ensureRunning();
        return llmModelManager.activateModel(modelId);
      case 'tts':
        if (!ttsModelManager.activateModel(modelId)) return false;
        // 模型选择立即释放旧引擎，无需等到下一次合成。
        ttsService.dispose();
        return true;
      default:
        return unsupportedModelType(modelType);
    }
  },
);
