import type { Model } from '@shared/models/Model';

/** 目录里的尺寸写法不统一（MiB / GiB / GB / ~631 MiB），统一换算成 MB 便于比较。 */
function parseSizeMb(size: string): number | null {
  const matched = /([\d.]+)\s*(MiB|GiB|MB|GB)/i.exec(size);
  if (!matched) return null;
  const value = Number(matched[1]);
  if (Number.isNaN(value)) return null;
  const unit = matched[2].toLowerCase();
  if (unit === 'gib') return value * 1073.741824;
  if (unit === 'gb') return value * 1000;
  if (unit === 'mib') return value * 1.048576;
  return value;
}

function getCapabilityTag(
  identity: string,
  modelType: 'stt' | 'tts' | 'llm',
): string {
  if (modelType === 'stt') {
    if (identity.includes('parakeet')) return '标点好';
    if (identity.includes('tdrz')) return '分角色';
    if (identity.includes('tiny')) return '最快';
    if (identity.includes('turbo')) return '快且准';
    if (identity.includes('base')) return '较快';
    // 本机实测（单一说话人、4 档模型）small 的转写准确率与 large-v1 相当甚至更好，
    // 体积却小 6 倍，不再沿用「small=均衡、large=最准」这个未经验证的默认假设。
    // 详见 docs/testing/stt-human-eval.md。
    if (identity.includes('small')) return '最准';
    if (identity.includes('medium')) return '较准';
    if (identity.includes('large')) return '全面';
    return '通用';
  }

  if (modelType === 'tts') {
    if (identity.includes('melo')) return '中英';
    if (identity.includes('moss')) return '20语言';
    if (identity.includes('kokoro')) return '多音色';
    return '离线';
  }

  // 本机实测（待办提取 + Agent 工具调用，5 模型横向扫描）结果：
  //  - qwen2.5:3b 把陈述句误判成待办的概率是 5 个模型里最低的（0%）；
  //  - phi4-mini 在待办提取和 Agent 两项任务上的准确率都是最低的，不再标「英文强」；
  //  - granite4 的 Agent 完成率最高，但待办提取误报率高达 54.5%，标签体现它的强项而非泛泛的语言能力；
  //  - ministral-3 是两项任务综合表现最好的模型。
  // 详见 docs/testing/llm-model-sweep.md。
  if (identity.includes('qwen') && identity.includes('3b')) return '零误报';
  if (identity.includes('qwen')) return '轻量';
  // phi4-mini 体积 2.5 GB，并不小，不能标「轻量」；本机实测两项任务准确率都是最低的。
  if (identity.includes('phi')) return '一般';
  if (identity.includes('granite')) return '工具强';
  if (identity.includes('ministral')) return '实测优';
  return '通用';
}

/**
 * STT 的速度取舍已经写在能力标签里（最快 / 均衡 / 最准），只在特别小或特别大时补一个尺寸标签；
 * LLM 的能力标签讲的是语言侧重，尺寸才是主要取舍，所以每个都给。
 */
function getSizeTag(
  sizeMb: number | null,
  modelType: 'stt' | 'tts' | 'llm',
): string | null {
  if (sizeMb === null) return null;
  if (modelType === 'llm') {
    if (sizeMb < 1200) return '小巧';
    if (sizeMb < 2400) return '中等';
    return '偏大';
  }
  if (modelType === 'tts') return null;
  if (sizeMb < 200) return '极小';
  if (sizeMb >= 2500) return '偏大';
  return null;
}

/**
 * 为下拉里的每个模型生成不超过三个短标签，用来快速判断取舍。
 * 标签一律控制在三个字以内，长说明仍走悬停提示。
 */
// 保留命名导出，与同目录的 ModelDescription 保持一致。
export function getModelTags(
  model: Model,
  modelType: 'stt' | 'tts' | 'llm',
): string[] {
  const identity = `${model.id} ${model.name}`.toLowerCase();
  const capability = getCapabilityTag(identity, modelType);
  const tags = [capability];

  if (modelType === 'tts') {
    if (identity.includes('moss')) tags.push('实验性');
    else if (identity.includes('kokoro')) tags.push('稳定');
    return tags;
  }

  const sizeTag = getSizeTag(parseSizeMb(model.size), modelType);
  if (sizeTag) tags.push(sizeTag);

  const quantized =
    identity.includes('q5') ||
    identity.includes('int8') ||
    Boolean((model as { quantization?: string | null }).quantization);
  if (quantized) tags.push('省内存');

  if (model.language === 'en') tags.push('英文');
  else if (model.language && model.language !== 'en') tags.push('多语言');

  return tags.slice(0, 3);
}
