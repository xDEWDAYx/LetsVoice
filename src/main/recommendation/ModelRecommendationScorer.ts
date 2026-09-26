import type {
  ModelCandidate,
  RecommendedModel,
  SystemProfile,
} from '@shared/types/ModelRecommendationTypes';

/** 根据硬件预算给候选模型评分；不负责采集硬件或 IPC。 */
export default class ModelRecommendationScorer {
  public static pick(
    models: ModelCandidate[],
    modelType: 'stt' | 'llm',
    profile: SystemProfile,
    locale: string,
  ): RecommendedModel | null {
    if (models.length === 0) return null;

    const memoryBudgetMb = this.getMemoryBudgetMb(modelType, profile);
    const prefersMultilingual = !locale.startsWith('en');
    const ranked = models
      .map((model) => {
        const sizeMb = this.parseSizeMb(model.size);
        const fits = sizeMb <= memoryBudgetMb;
        const languageBonus =
          prefersMultilingual && model.language === 'multilingual' ? 160 : 0;
        const score = fits
          ? sizeMb + languageBonus
          : memoryBudgetMb - (sizeMb - memoryBudgetMb) * 4 + languageBonus;
        return { model, score };
      })
      .sort((left, right) => right.score - left.score);
    const selected = ranked[0].model;
    const workload = modelType === 'stt' ? '本地转录' : '本地 AI 问答';

    return {
      id: selected.id,
      name: selected.name,
      reason: `${profile.totalMemoryGb} GB 内存与 ${profile.logicalCores} 个逻辑核心适合运行约 ${selected.size} 的${workload}模型，在速度和效果之间较平衡。`,
    };
  }

  private static getMemoryBudgetMb(
    modelType: 'stt' | 'llm',
    profile: SystemProfile,
  ): number {
    const { totalMemoryGb, logicalCores } = profile;
    let budget: number;

    if (modelType === 'stt') {
      if (totalMemoryGb < 8) budget = 180;
      else if (totalMemoryGb < 12) budget = 520;
      else if (totalMemoryGb < 24) budget = 1700;
      else budget = 3200;
    } else if (totalMemoryGb < 8) budget = 1100;
    else if (totalMemoryGb < 12) budget = 2200;
    else if (totalMemoryGb < 24) budget = 3600;
    else budget = 8000;

    if (logicalCores <= 4) return budget * 0.65;
    if (logicalCores <= 8) return budget * 0.85;
    return budget;
  }

  private static parseSizeMb(size: string): number {
    const match = size.trim().match(/([\d.]+)\s*(gib|gb|mib|mb)/i);
    if (!match) return 0;
    const value = Number(match[1]);
    return /g/i.test(match[2]) ? value * 1024 : value;
  }
}
