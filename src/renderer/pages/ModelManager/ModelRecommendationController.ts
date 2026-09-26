import type { Model } from '@shared/models/Model';

export type SystemProfile = {
  cpuModel: string;
  logicalCores: number;
  totalMemoryGb: number;
  availableMemoryGb: number;
  gpuName: string | null;
  level: '入门' | '均衡' | '高性能';
};

export type RecommendedModel = {
  id: string;
  name: string;
  reason: string;
};

export type ModelRecommendation = {
  profile: SystemProfile;
  stt: RecommendedModel | null;
  llm: RecommendedModel | null;
  detectedAt: string;
};

type RecommendationApi = {
  getModels(
    sttModels: Model[],
    llmModels: Model[],
  ): Promise<ModelRecommendation>;
};

/** Renderer 控制器只负责调用 IPC，硬件评分规则保留在 main。 */
export class ModelRecommendationController {
  private readonly api: RecommendationApi;

  public constructor(api: RecommendationApi = window.electron.recommendation) {
    this.api = api;
  }

  public getRecommendation(
    sttModels: Model[],
    llmModels: Model[],
  ): Promise<ModelRecommendation> {
    return this.api.getModels(sttModels, llmModels);
  }
}
