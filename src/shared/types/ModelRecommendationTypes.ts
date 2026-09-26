export type ModelCandidate = {
  id: string;
  name: string;
  size: string;
  language: string;
  engine: string;
};

/** 模型和运行时实际落盘的分区容量，用于判断还能不能再装一个大模型。 */
export type StorageProfile = {
  root: string;
  totalGb: number;
  freeGb: number;
};

export type GpuInfo = {
  name: string;
  vendor: string | null;
  vramGb: number | null;
  driverVersion: string | null;
  /** 该条信息的来源，便于排查检测差异。 */
  source: string;
  /** 虚拟显示器 / 远程桌面适配器，不能用于推理。 */
  virtual: boolean;
};

/** CUDA 决定 LLM 和转写能否吃到显卡加速，单独展示。 */
export type CudaInfo = {
  available: boolean;
  version: string | null;
  driverVersion: string | null;
  deviceCount: number;
};

export type SystemProfile = {
  cpuModel: string;
  logicalCores: number;
  totalMemoryGb: number;
  availableMemoryGb: number;
  /** 主显卡名称，保留给推荐逻辑和旧调用方。 */
  gpuName: string | null;
  gpus: GpuInfo[];
  cuda: CudaInfo;
  storage: StorageProfile | null;
  platform: string;
  arch: string;
  level: '入门' | '均衡' | '高性能';
};

export type RecommendedModel = {
  id: string;
  name: string;
  reason: string;
};

export type ModelRecommendationResult = {
  profile: SystemProfile;
  stt: RecommendedModel | null;
  llm: RecommendedModel | null;
  detectedAt: string;
};
