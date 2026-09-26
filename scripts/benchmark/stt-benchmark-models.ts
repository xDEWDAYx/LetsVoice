/**
 * 跨机器 STT 基准的模型集合：**应用目录里全部的 whisper 模型**。
 *
 * ## 为什么要固定，以及为什么是全量
 *
 * bench:stt 默认测「这台机器上装了哪些 whisper 模型」。跨机器跑的时候这会让每台机器
 * 测到不同的集合 —— 实测结果：fan3090 只有 small、jack 有 3 个、m2-pro-16gb 有 4 个、
 * desktop-qg1ej01 有 13 档，cross-stt-rtf.svg 于是变成一张几乎无法对读的图。
 *
 * 集合直接取自 config/stt-catalog.json，而不是在这里另抄一份：
 * 那份 JSON 就是应用自己对「有哪些 STT 模型」的定义，抄一份必然会漂。
 * 目录里新增模型时，跨机器基准自动跟着测，不需要改这个文件。
 *
 * ## 代价
 *
 * 全量约 18 GiB，跑完一轮在较快的机器上约 5 小时（体积越大越不成比例地慢：
 * 同一批 14.5 分钟录音，tiny 约 1.5 分钟，large-v1 约 38 分钟）。
 * 这是刻意接受的：跨机器表要的是每台机器都有完整的一列，
 * 少一档就少一个可比的点。
 *
 * ## 为什么不含 parakeet
 *
 * 目录里还有一个 parakeet-tdt-0.6b-v2-int8，但它是 sherpa-onnx 引擎、不是 .bin 格式，
 * resolveWhisper() 只认 whisper.cpp 的 .bin，bench:stt 跑不了它。
 * 下载它不会多出任何一根柱子，所以排除 —— 这不是为了省空间。
 */

import sttCatalogJson from '../../config/stt-catalog.json';

type SttCatalogEntry = {
  id: string;
  name: string;
  engine: string;
  size: string;
  downloadUrl: string;
};

export type BenchmarkSttModel = {
  /** stt-catalog.json 里的 id，bench:stt:fetch 用它下载。 */
  catalogId: string;
  /** 结果与图表里的 id，由 ggml-<id>.bin 推出，bench:stt --models 用它筛选。 */
  runtimeId: string;
  /** 下载体积，用于在开始前给出总量提示。 */
  size: string;
};

/** whisper.cpp 的模型文件叫 ggml-<runtimeId>.bin，结果里的 id 就是这么来的。 */
function runtimeIdFromUrl(downloadUrl: string): string {
  const fileName = downloadUrl.split('/').pop() ?? '';
  return fileName.replace(/^ggml-/, '').replace(/\.bin$/, '');
}

export const STT_BENCHMARK_MODELS: BenchmarkSttModel[] = (
  (sttCatalogJson as { stt: SttCatalogEntry[] }).stt ?? []
)
  // 只要 whisper.cpp 的：bench:stt 跑的是 whisper-cli，别的引擎测不了。
  .filter((item) => item.engine === 'whisper.cpp')
  .map((item) => ({
    catalogId: item.id,
    runtimeId: runtimeIdFromUrl(item.downloadUrl),
    size: item.size,
  }));

/** 传给 bench:stt --models 的筛选串。 */
export function sttBenchmarkModelFilter(): string {
  return STT_BENCHMARK_MODELS.map((model) => model.runtimeId).join(',');
}

/** 传给 bench:stt:fetch 的下载列表。 */
export function sttBenchmarkCatalogIds(): string[] {
  return STT_BENCHMARK_MODELS.map((model) => model.catalogId);
}
