import sttCatalogJson from '../../../config/stt-catalog.json';
import { STTModel } from './STTModel';
import { ModelManager } from './ModelManager';
import ActiveModelStateStore from './ActiveModelStateStore';
import { ManagedPaths } from '../runtime/ManagedPaths';
import FileDownloadService, {
  DownloadProgress,
} from '../runtime/FileDownloadService';
import ParakeetModelInstaller from '../transcription/ParakeetModelInstaller';
import STTModelStorage from '../transcription/STTModelStorage';
import {
  PARAKEET_ENGINE,
  STTCatalogItem,
} from '../transcription/STTModelCatalog';

type STTCatalog = {
  stt: STTCatalogItem[];
};

type STTModelManagerDependencies = {
  managedPaths?: ManagedPaths;
  downloader?: FileDownloadService;
  stateStore?: ActiveModelStateStore;
  storage?: STTModelStorage;
  parakeetInstaller?: ParakeetModelInstaller;
};

/**
 * STT 模型目录服务。目录中的真实文件决定下载状态，userData 状态文件决定当前模型。
 */
// 保留命名导出，与现有 IPC 和推荐模块的导入方式一致。
export class STTModelManager implements ModelManager {
  private readonly catalog: STTCatalogItem[];

  private readonly storage: STTModelStorage;

  private readonly stateStore: ActiveModelStateStore;

  private readonly downloader: FileDownloadService;

  private readonly parakeetInstaller: ParakeetModelInstaller;

  public constructor(dependencies: STTModelManagerDependencies = {}) {
    const managedPaths =
      dependencies.managedPaths ?? ManagedPaths.getInstance();

    this.catalog = (sttCatalogJson as STTCatalog).stt;
    this.storage =
      dependencies.storage ??
      new STTModelStorage(managedPaths.getRuntimePaths('stt').modelsRoot);
    this.downloader = dependencies.downloader ?? new FileDownloadService();
    this.parakeetInstaller =
      dependencies.parakeetInstaller ??
      new ParakeetModelInstaller(managedPaths, this.downloader);
    this.stateStore =
      dependencies.stateStore ??
      new ActiveModelStateStore(
        managedPaths.resolveManagedPath('model-state', 'stt.json'),
      );
  }

  public getModelList(): STTModel[] {
    const downloadedIds = this.catalog
      .filter((item) => this.storage.isInstalled(item))
      .map((item) => item.id);
    // 已下载但没人选中的情况下自动选一个，别让用户卡在「未选择模型」。
    const activeModelId = this.stateStore.resolveActiveModelId(downloadedIds);

    return this.catalog.map((item) => {
      const downloaded = downloadedIds.includes(item.id);
      return STTModelManager.createModel(
        item,
        downloaded,
        downloaded && activeModelId === item.id,
      );
    });
  }

  public async downloadModel(
    id: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const item = this.findCatalogItem(id);
    const modelPath = this.storage.getInstallPath(item);

    if (this.storage.isInstalled(item)) {
      throw new Error('模型已经下载 / Model has already been downloaded');
    }

    if (item.engine === PARAKEET_ENGINE) {
      await this.parakeetInstaller.install(item, modelPath, onProgress);
    } else {
      await this.downloader.download(item.downloadUrl, modelPath, {
        expectedSha1: item.checksum,
        onProgress,
      });
    }
  }

  public async deleteModel(id: string): Promise<void> {
    const item = this.findCatalogItem(id);
    if (!this.storage.isInstalled(item)) {
      throw new Error('模型尚未下载 / Model has not been downloaded');
    }

    await this.storage.remove(item);
    if (this.stateStore.getActiveModelId() === id) {
      this.stateStore.setActiveModelId(null);
    }
  }

  public activateModel(id: string): boolean {
    const item = this.findCatalogItem(id);
    if (!this.storage.isInstalled(item)) return false;

    this.stateStore.setActiveModelId(id);
    return true;
  }

  public getActivatedModel(): STTModel | null {
    return this.getModelList().find((model) => model.activated) ?? null;
  }

  public getActivatedModelPath(): string | null {
    const activeModelId = this.stateStore.getActiveModelId();
    if (!activeModelId) return null;

    const item = this.catalog.find(
      (candidate) => candidate.id === activeModelId,
    );
    if (!item) return null;

    return this.storage.isInstalled(item)
      ? this.storage.getInstallPath(item)
      : null;
  }

  private findCatalogItem(id: string): STTCatalogItem {
    const item = this.catalog.find((candidate) => candidate.id === id);
    if (!item) throw new Error('找不到模型 / Model not found');
    return item;
  }

  private static createModel(
    item: STTCatalogItem,
    downloaded: boolean,
    activated: boolean,
  ): STTModel {
    return new STTModel(
      item.id,
      item.name,
      item.language,
      item.engine,
      item.format,
      item.size,
      item.downloadUrl,
      item.checksum,
      downloaded,
      activated,
    );
  }
}
