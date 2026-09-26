export type ResolvedSttModel = {
  id: string;
  path: string;
};

export function selectRequestedSttModels(
  models: ResolvedSttModel[],
  requestedIds?: string[],
): ResolvedSttModel[] {
  if (!requestedIds) return models;

  const availableIds = new Set(models.map((model) => model.id));
  const missing = requestedIds.filter((id) => !availableIds.has(id));
  if (missing.length > 0) {
    throw new Error(`缺少指定的 whisper 模型：${missing.join(', ')}`);
  }

  const requested = new Set(requestedIds);
  return models.filter((model) => requested.has(model.id));
}
