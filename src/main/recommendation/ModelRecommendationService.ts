import { app } from 'electron';
import type {
  ModelCandidate,
  ModelRecommendationResult,
} from '@shared/types/ModelRecommendationTypes';
import ModelRecommendationScorer from './ModelRecommendationScorer';
import SystemProfileService from './SystemProfileService';

/** 组织硬件检测和模型评分，IPC 只需调用这一入口。 */
export default class ModelRecommendationService {
  public static async recommend(
    rawSttModels: unknown,
    rawLlmModels: unknown,
  ): Promise<ModelRecommendationResult> {
    const profile = await SystemProfileService.detect();
    const locale = app.getLocale().toLowerCase();
    const sttModels = this.normalizeModels(rawSttModels);
    const llmModels = this.normalizeModels(rawLlmModels);

    return {
      profile,
      stt: ModelRecommendationScorer.pick(sttModels, 'stt', profile, locale),
      llm: ModelRecommendationScorer.pick(llmModels, 'llm', profile, locale),
      detectedAt: new Date().toISOString(),
    };
  }

  private static normalizeModels(rawModels: unknown): ModelCandidate[] {
    if (!Array.isArray(rawModels)) return [];
    return rawModels.flatMap((item) => this.normalizeModel(item));
  }

  private static normalizeModel(rawModel: unknown): ModelCandidate[] {
    if (!rawModel || typeof rawModel !== 'object') return [];
    const model = rawModel as Record<string, unknown>;
    if (typeof model.id !== 'string' || typeof model.name !== 'string')
      return [];

    return [
      {
        id: model.id,
        name: model.name,
        size: typeof model.size === 'string' ? model.size : '0 MB',
        language:
          typeof model.language === 'string' ? model.language : 'unknown',
        engine: typeof model.engine === 'string' ? model.engine : 'unknown',
      },
    ];
  }
}
