export type TTSSpeaker = {
  id: string;
  name: string;
  label: string;
  language: string;
  isDefault: boolean;
};

export type TTSRuntimeDependencyStatus = {
  id: 'sherpa-onnx-node' | 'onnxruntime-node' | 'sentencepiece-js';
  name: string;
  installed: boolean;
  version: string | null;
};

export type TTSRuntimeStatus = {
  runtimeName: 'local-onnx';
  activeModelId: string | null;
  activeBackend: string | null;
  modelName: string | null;
  modelDir: string | null;
  packageInstalled: boolean;
  packageVersion: string | null;
  modelReady: boolean;
  runtimeReady: boolean;
  missingFiles: string[];
  speakers: TTSSpeaker[];
  defaultSpeakerId: string | null;
  sampleRate: number;
  manifestPresent: boolean;
  installedModelCount: number;
  runtimes: TTSRuntimeDependencyStatus[];
};

export type TTSBackend = 'sherpa-kokoro' | 'sherpa-vits' | 'moss-onnx';

/** 一次本地合成的结果，直接经 IPC 交给渲染层播放，不落盘。 */
export type TTSAudioResult = {
  source: 'local';
  backend: TTSBackend;
  modelId: string;
  modelName: string;
  speakerId: string;
  speakerName: string;
  sampleRate: number;
  channelCount: number;
  channelData: Float32Array[];
};
