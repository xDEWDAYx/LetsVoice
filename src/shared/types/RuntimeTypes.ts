/*
 * 运行时状态的跨进程契约。
 *
 * 这些形状原先散在 RuntimeStatusService / WhisperRuntimeService /
 * OllamaRuntimeService / ParakeetRuntimeService 里，而那几个文件顶层就
 * import 了 fs、path 和 electron 侧模块 —— Renderer 只为拿一个 interface
 * 就得 import 它们，全靠 TS 类型擦除才没出事。集中放这里断开这层耦合。
 */
import type { TTSRuntimeStatus } from './TTSRuntimeTypes';

export type RuntimeKind = 'stt' | 'llm' | 'tts';

export type ManagedRuntimeState = 'missing' | 'partial' | 'ready';

export type WhisperRuntimeLocation = 'portable' | 'system-path' | 'missing';

export type OllamaRuntimeLocation =
  | 'portable'
  | 'installed'
  | 'system-path'
  | 'missing';

export type WhisperRuntimeStatus = {
  ready: boolean;
  runtimeLocation: WhisperRuntimeLocation;
  whisperCliPath: string;
  whisperCliPresent: boolean;
  ffmpegPath: string | null;
  ffmpegPresent: boolean;
  activeModelId: string | null;
  activeModelName: string | null;
  activeModelPath: string | null;
};

export type OllamaRuntimeStatus = {
  runtimeName: 'Ollama';
  serverUrl: string;
  binaryPath: string | null;
  runtimeLocation: OllamaRuntimeLocation;
  binaryPresent: boolean;
  serverRunning: boolean;
  installedModels: string[];
  activeModelId: string | null;
  activeModelName: string | null;
  runtimeReady: boolean;
};

export type ParakeetRuntimeStatus = {
  ready: boolean;
  packageInstalled: boolean;
  packageVersion: string | null;
  activeModelId: string | null;
  activeModelName: string | null;
  modelDir: string | null;
  modelType: 'nemo_transducer';
  requiredFiles: Record<string, string>;
  missingFiles: string[];
  ffmpegPath: string | null;
};

export type RuntimeInstallTarget = 'whisper' | 'ffmpeg' | 'ollama';

export type RuntimeInstallSupport = {
  /** 当前平台能否由应用自动下载安装该运行时。 */
  supported: boolean;
  /** 不支持自动安装时，告诉用户该怎么自己装。 */
  manualHint: string;
};

export type RuntimeInstallSupportSummary = {
  platform: NodeJS.Platform;
  whisper: RuntimeInstallSupport;
  ffmpeg: RuntimeInstallSupport;
  ollama: RuntimeInstallSupport;
};

export type RuntimeComponentStatus = {
  kind: RuntimeKind;
  managedState: ManagedRuntimeState;
  runtimePresent: boolean;
  manifestPresent: boolean;
  installedModelCount: number;
};

export type RuntimeStatusSummary = {
  storageRoot: string;
  components: RuntimeComponentStatus[];
  transcription: WhisperRuntimeStatus;
  parakeetTranscription: ParakeetRuntimeStatus;
  languageModel: OllamaRuntimeStatus;
  speechSynthesis: TTSRuntimeStatus;
  /** 当前平台哪些运行时能自动安装；界面据此决定给按钮还是给手动说明。 */
  installSupport: RuntimeInstallSupportSummary;
};
