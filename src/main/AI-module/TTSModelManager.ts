import ActiveModelStateStore from './ActiveModelStateStore';
import { ModelManager } from './ModelManager';
import TTSModel from './TTSModel';
import { ManagedPaths } from '../runtime/ManagedPaths';
import FileDownloadService from '../runtime/FileDownloadService';
import TTSModelInstaller from '../tts/TTSModelInstaller';
import TTSModelStorage from '../tts/TTSModelStorage';
import { TTSInstallProgress } from '../tts/TTSInstallSupport';
import {
  getTTSModelCatalogItem,
  TTS_MODEL_CATALOG,
  TTSModelCatalogItem,
} from '../tts/TTSModelCatalog';

type TTSModelManagerDependencies = {
  managedPaths?: ManagedPaths;
  stateStore?: ActiveModelStateStore;
  storage?: TTSModelStorage;
  installer?: TTSModelInstaller;
  downloader?: FileDownloadService;
};

/** TTS 模型与 STT/LLM 共用相同的下载、激活和删除语义。 */
export default class TTSModelManager implements ModelManager {
  private readonly stateStore: ActiveModelStateStore;

  private readonly storage: TTSModelStorage;

  private readonly installer: TTSModelInstaller;

  public constructor(dependencies: TTSModelManagerDependencies = {}) {
    const managedPaths =
      dependencies.managedPaths ?? ManagedPaths.getInstance();
    this.storage =
      dependencies.storage ??
      new TTSModelStorage(managedPaths.getRuntimePaths('tts').modelsRoot);
    this.stateStore =
      dependencies.stateStore ??
      new ActiveModelStateStore(
        managedPaths.resolveManagedPath('model-state', 'tts.json'),
      );
    this.installer =
      dependencies.installer ??
      new TTSModelInstaller(
        managedPaths,
        this.storage,
        dependencies.downloader,
      );
  }

  public getModelList(): TTSModel[] {
    const downloadedIds = TTS_MODEL_CATALOG.filter((item) =>
      this.storage.isInstalled(item),
    ).map((item) => item.id);
    // 已下载但没人选中的情况下自动选一个，别让用户卡在「未选择模型」。
    const activeModelId = this.stateStore.resolveActiveModelId(downloadedIds);
    return TTS_MODEL_CATALOG.map((item) => {
      const downloaded = downloadedIds.includes(item.id);
      return TTSModelManager.createModel(
        item,
        downloaded,
        downloaded && activeModelId === item.id,
      );
    });
  }

  public async downloadModel(
    id: string,
    onProgress?: (progress: TTSInstallProgress) => void,
  ): Promise<void> {
    const item = getTTSModelCatalogItem(id);
    if (this.storage.isInstalled(item)) {
      throw new Error('模型已经下载 / Model has already been downloaded');
    }
    await this.installer.install(item, onProgress);
  }

  public async deleteModel(id: string): Promise<void> {
    const item = getTTSModelCatalogItem(id);
    if (this.stateStore.getActiveModelId() === id) {
      throw new Error('正在使用的 TTS 模型无法删除，请先切换模型');
    }
    if (!this.storage.isInstalled(item)) {
      throw new Error('模型尚未下载 / Model has not been downloaded');
    }
    await this.storage.remove(item);
  }

  public activateModel(id: string): boolean {
    const item = getTTSModelCatalogItem(id);
    if (!this.storage.isInstalled(item)) return false;
    this.stateStore.setActiveModelId(id);
    return true;
  }

  public getActivatedModel(): TTSModel | null {
    return this.getModelList().find((model) => model.activated) ?? null;
  }

  public getActivatedModelPath(): string | null {
    const active = this.getActivatedModel();
    if (!active) return null;
    return this.storage.getInstallPath(getTTSModelCatalogItem(active.id));
  }

  private static createModel(
    item: TTSModelCatalogItem,
    downloaded: boolean,
    activated: boolean,
  ): TTSModel {
    return new TTSModel(
      item.id,
      item.name,
      item.language,
      item.engine,
      item.format,
      item.size,
      downloaded,
      activated,
      item.recommended,
    );
  }
}
