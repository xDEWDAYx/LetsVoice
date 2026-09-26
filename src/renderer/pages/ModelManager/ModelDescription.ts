import type { Model } from '@shared/models/Model';

/** 为目录中的每个模型生成简短用途说明，避免把文案写进下载配置。 */
export function getModelDescription(model: Model, modelType: string): string {
  const identity = `${model.id} ${model.name}`.toLowerCase();

  if (modelType === 'stt') {
    if (identity.includes('parakeet')) {
      return '英语离线识别模型，保留标点和大小写，适合英文会议与访谈。';
    }
    if (identity.includes('tdrz')) {
      return '侧重英文说话人区分，适合多人会议记录。';
    }
    if (identity.includes('tiny')) {
      return '速度最快、资源占用最低，但本机实测转写错误率明显更高，只适合快速草稿。';
    }
    if (identity.includes('base')) {
      return '轻量且比 Tiny 更准确，适合日常短录音和课堂速记。';
    }
    if (identity.includes('small')) {
      return '本机实测准确率与体积大 6 倍的 Large 相当甚至更好，速度快很多，多数场景优先选它。';
    }
    if (identity.includes('medium')) {
      return '更重视复杂语音的准确率，适合长录音和多语言内容。';
    }
    if (identity.includes('large')) {
      return '体积和显存占用最大；本机实测（单一说话人）准确率并未明显超过 Small，仅在追求极限覆盖时再选它。';
    }
    return '本地语音识别模型，录音无需离开当前设备。';
  }

  if (modelType === 'tts') {
    if (identity.includes('melo')) {
      return '中英双语单音色模型，体积和速度最均衡；本机可懂度代理指标三者中最低，但最省资源，多数场景仍是稳妥选择。';
    }
    if (identity.includes('moss')) {
      return '支持 20 种语言和 18 个官方音色；本机可懂度代理指标三者中最高，但长文本峰值内存可达约 10 GiB，内存吃紧的机器慎选。';
    }
    if (identity.includes('kokoro')) {
      return '成熟的多语言、多音色本地模型；本机可懂度代理指标接近 MOSS，且内存开销远低于 MOSS，适合要多音色又想兼顾准确率的场景。';
    }
    return '本地文字转语音模型。';
  }

  if (identity.includes('qwen') && identity.includes('3b')) {
    return '中文和多语言表现均衡；本机实测把陈述句误判成待办的概率最低（0%），但整体准确率中等。';
  }
  if (identity.includes('qwen')) {
    return '体积最小、速度最快；本机实测误判陈述句为待办的概率偏高，用于粗筛草稿更合适。';
  }
  if (identity.includes('phi')) {
    return '本机实测在待办提取和 Agent 任务上的准确率是几个模型里最低的，体积也不算小，暂不建议优先选它。';
  }
  if (identity.includes('ministral')) {
    return (
      '紧凑型多语言模型；本机实测待办提取最好（F1 95.7%、误报率 6.1%），Agent 完成率次高（53.3%），' +
      '没有明显短板，是目前实测推荐的默认选择。'
    );
  }
  if (identity.includes('granite')) {
    return 'Agent 工具调用完成率本机实测最高（60.0%），但待办提取容易把陈述句误判成任务（误报率 54.5%），两类场景表现差异大。';
  }
  return '通过 Ollama 在本机运行的语言模型，适合私密内容处理。';
}
