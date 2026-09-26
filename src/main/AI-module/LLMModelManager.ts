import ollama from 'ollama';
import llmCatalogJson from '../../../config/llm-catalog.json';
import { ModelManager } from './ModelManager';
import { LLMModel } from './LLMModel';
import ActiveModelStateStore from './ActiveModelStateStore';
import { ManagedPaths } from '../runtime/ManagedPaths';

type LLMCatalogItem = {
  id: string;
  name: string;
  language: string;
  engine: string;
  format: string;
  quantization: string | null;
  size: string;
  modelName: string;
};

type LLMCatalog = { llm: LLMCatalogItem[] };

type OllamaClient = Pick<typeof ollama, 'list' | 'pull' | 'delete'>;

export type LLMDownloadProgress = {
  status: string;
  completed: number;
  total: number;
};

type LLMModelManagerDependencies = {
  managedPaths?: ManagedPaths;
  client?: OllamaClient;
  stateStore?: ActiveModelStateStore;
};

/** 使用 Ollama 实际模型列表计算下载状态，激活 ID 单独保存在 userData。 */
export class LLMModelManager implements ModelManager {
  private readonly catalog: LLMCatalogItem[];

  private readonly client: OllamaClient;

  private readonly stateStore: ActiveModelStateStore;

  public constructor(dependencies: LLMModelManagerDependencies = {}) {
    const managedPaths =
      dependencies.managedPaths ?? ManagedPaths.getInstance();
    this.catalog = (llmCatalogJson as LLMCatalog).llm;
    this.client = dependencies.client ?? ollama;
    this.stateStore =
      dependencies.stateStore ??
      new ActiveModelStateStore(
        managedPaths.resolveManagedPath('model-state', 'llm.json'),
      );
  }

  public async getModelList(): Promise<LLMModel[]> {
    const installedModels = await this.getInstalledModelNames();
    const downloadedIds = this.catalog
      .filter((item) =>
        installedModels.has(LLMModelManager.normalizeModelName(item.modelName)),
      )
      .map((item) => item.id);
    // 已下载但没人选中的情况下自动选一个，别让用户卡在「未选择模型」。
    // Ollama 没起来时 installedModels 为空，resolveActiveModelId 会保持原选择不变。
    const activeModelId = this.stateStore.resolveActiveModelId(downloadedIds);

    return this.catalog.map((item) => {
      const downloaded = downloadedIds.includes(item.id);
      return LLMModelManager.createModel(
        item,
        downloaded,
        downloaded && activeModelId === item.id,
      );
    });
  }

  public async downloadModel(
    id: string,
    onProgress?: (progress: LLMDownloadProgress) => void,
  ): Promise<void> {
    const item = this.findCatalogItem(id);
    const installedModels = await this.getInstalledModelNames();
    if (
      installedModels.has(LLMModelManager.normalizeModelName(item.modelName))
    ) {
      throw new Error('模型已经下载 / Model has already been downloaded');
    }

    const progressStream = await this.client.pull({
      model: item.modelName,
      stream: true,
    });
    // Ollama 按顺序发送同一下载的进度事件。
    // eslint-disable-next-line no-restricted-syntax
    for await (const progress of progressStream) {
      onProgress?.({
        status: progress.status,
        completed: progress.completed ?? 0,
        total: progress.total ?? 0,
      });
    }
  }

  public async deleteModel(id: string): Promise<void> {
    const item = this.findCatalogItem(id);
    const installedModels = await this.getInstalledModelNames();
    if (
      !installedModels.has(LLMModelManager.normalizeModelName(item.modelName))
    ) {
      throw new Error('模型尚未下载 / Model has not been downloaded');
    }

    await this.client.delete({ model: item.modelName });
    if (this.stateStore.getActiveModelId() === id) {
      this.stateStore.setActiveModelId(null);
    }
  }

  public async activateModel(id: string): Promise<boolean> {
    const item = this.findCatalogItem(id);
    const installedModels = await this.getInstalledModelNames();
    if (
      !installedModels.has(LLMModelManager.normalizeModelName(item.modelName))
    ) {
      return false;
    }

    this.stateStore.setActiveModelId(id);
    return true;
  }

  public async getActivatedModel(): Promise<LLMModel | null> {
    const models = await this.getModelList();
    return models.find((model) => model.activated) ?? null;
  }

  private async getInstalledModelNames(): Promise<Set<string>> {
    try {
      const response = await this.client.list();
      return new Set(
        response.models.flatMap((model) =>
          [model.name, model.model]
            .filter((name): name is string => typeof name === 'string')
            .map(LLMModelManager.normalizeModelName),
        ),
      );
    } catch {
      // Ollama 未运行时模型页仍可加载，运行时面板会显示具体状态。
      return new Set();
    }
  }

  private findCatalogItem(id: string): LLMCatalogItem {
    const item = this.catalog.find((candidate) => candidate.id === id);
    if (!item) throw new Error('找不到模型 / Model not found');
    return item;
  }

  private static normalizeModelName(modelName: string): string {
    const normalized = modelName.trim().toLowerCase();
    return normalized.includes(':') ? normalized : `${normalized}:latest`;
  }

  private static createModel(
    item: LLMCatalogItem,
    downloaded: boolean,
    activated: boolean,
  ): LLMModel {
    return new LLMModel(
      item.id,
      item.name,
      item.language,
      item.engine,
      item.format,
      item.quantization,
      item.size,
      item.modelName,
      downloaded,
      activated,
    );
  }
}
