import type { OllamaRuntimeStatus } from '@shared/types/RuntimeTypes';
import { LLMModelManager } from '../AI-module/LLMModelManager';
import OllamaRuntimeLocator from './OllamaRuntimeLocator';
import { OLLAMA_SERVER_URL, readOllamaModelNames } from './OllamaEndpoint';

type RuntimeServiceDependencies = {
  locator?: OllamaRuntimeLocator;
  modelManager?: LLMModelManager;
  fetchImpl?: typeof fetch;
  serverUrl?: string;
};

export type { OllamaRuntimeStatus };

/**
 * 读取 Ollama 的本机状态。
 * 操作方法：Renderer 调用 Runtime:getStatus；本方法只探测，不会自动启动服务。
 */
export default class OllamaRuntimeService {
  private readonly locator: OllamaRuntimeLocator;

  private readonly modelManager: LLMModelManager;

  private readonly fetchImpl: typeof fetch;

  private readonly serverUrl: string;

  public constructor(dependencies: RuntimeServiceDependencies = {}) {
    this.locator = dependencies.locator ?? new OllamaRuntimeLocator();
    this.modelManager = dependencies.modelManager ?? new LLMModelManager();
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.serverUrl = dependencies.serverUrl ?? OLLAMA_SERVER_URL;
  }

  public async getStatus(): Promise<OllamaRuntimeStatus> {
    const binary = this.locator.locate();
    const installedModels = await readOllamaModelNames(
      this.fetchImpl,
      this.serverUrl,
    );
    const serverRunning = installedModels !== null;
    const activeModel = serverRunning
      ? await this.modelManager.getActivatedModel()
      : null;

    return {
      runtimeName: 'Ollama',
      serverUrl: this.serverUrl,
      binaryPath: binary.binaryPath,
      runtimeLocation: binary.location,
      binaryPresent: binary.binaryPath !== null,
      serverRunning,
      installedModels: installedModels ?? [],
      activeModelId: activeModel?.id ?? null,
      activeModelName: activeModel?.modelName ?? null,
      // 聊天真正需要的是可访问的服务和已激活模型；二者缺一都不可执行。
      runtimeReady: serverRunning && activeModel !== null,
    };
  }
}
