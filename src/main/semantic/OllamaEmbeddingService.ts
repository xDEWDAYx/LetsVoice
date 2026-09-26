import ollama from 'ollama';
import type {
  EmbeddingInstallProgress,
  EmbeddingModelStatus,
} from '@shared/types/SemanticTypes';

export const DEFAULT_EMBEDDING_MODEL = 'bge-m3';
type Client = Pick<typeof ollama, 'list' | 'pull' | 'embed'>;

/** Embedding 复用现有 Ollama，不安装第二套模型运行时。 */
export default class OllamaEmbeddingService {
  private readonly client: Client;

  public readonly modelName: string;

  public constructor(
    client: Client = ollama,
    modelName = DEFAULT_EMBEDDING_MODEL,
  ) {
    this.client = client;
    this.modelName = modelName;
  }

  public async getStatus(): Promise<EmbeddingModelStatus> {
    try {
      const response = await this.client.list();
      const installed = response.models.some((model) =>
        [model.name, model.model].some(
          (name) =>
            typeof name === 'string' &&
            OllamaEmbeddingService.normalizeTag(name) ===
              OllamaEmbeddingService.normalizeTag(this.modelName),
        ),
      );
      return {
        runtimeName: 'Ollama',
        modelName: this.modelName,
        serverAvailable: true,
        installed,
      };
    } catch {
      return {
        runtimeName: 'Ollama',
        modelName: this.modelName,
        serverAvailable: false,
        installed: false,
      };
    }
  }

  public async install(
    onProgress?: (progress: EmbeddingInstallProgress) => void,
  ): Promise<EmbeddingModelStatus> {
    const current = await this.getStatus();
    if (current.installed) return current;
    const stream = await this.client.pull({
      model: this.modelName,
      stream: true,
    });
    // Ollama 下载事件必须按原顺序转发给 Renderer。
    // eslint-disable-next-line no-restricted-syntax
    for await (const progress of stream) {
      onProgress?.({
        status: progress.status,
        completed: progress.completed ?? 0,
        total: progress.total ?? 0,
      });
    }
    return this.getStatus();
  }

  public async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const status = await this.getStatus();
    if (!status.installed) {
      throw new Error('请先安装 bge-m3 Embedding 模型');
    }
    const response = await this.client.embed({
      model: this.modelName,
      input: texts,
    });
    const vectors = response.embeddings as number[][];
    if (
      vectors.length !== texts.length ||
      vectors.some(
        (vector) =>
          !Array.isArray(vector) ||
          vector.length === 0 ||
          !vector.every(Number.isFinite),
      )
    ) {
      throw new Error('Ollama 返回了无效的 Embedding 向量');
    }
    return vectors;
  }

  private static normalizeTag(value: string): string {
    const normalized = value.trim().toLocaleLowerCase();
    return normalized.includes(':') ? normalized : `${normalized}:latest`;
  }
}
