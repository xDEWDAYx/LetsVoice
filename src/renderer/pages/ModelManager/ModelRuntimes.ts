import type {
  RuntimeInstallSupport,
  RuntimeStatusSummary,
} from '@shared/types/RuntimeTypes';
import type { EmbeddingModelStatus } from '@shared/types/SemanticTypes';
import type { RuntimeInfo } from './components/ModelModule';
import type { ModuleKey } from './useModelManager';

export type RuntimeActions = {
  installWhisper: () => void;
  installFfmpeg: () => void;
  installOllama: () => void;
  uninstall: (module: ModuleKey, target: string) => void;
};

/** 应用自己下载的运行时才可卸载，其余只展示来源。 */
function describeSource(location: string): string {
  if (location === 'portable') return '本应用安装，可卸载';
  if (location === 'installed') return '系统已安装，需在系统里卸载';
  if (location === 'system-path') return '来自系统 PATH，需自行卸载';
  return '未安装';
}

/**
 * 未安装、且当前平台不支持自动安装时，把「怎么手动装」直接写进提示里。
 * 不这样做的话，macOS / Linux 用户看到的只是一个点了必然失败的安装按钮。
 */
function describeRuntime(
  baseHint: string,
  present: boolean,
  support: RuntimeInstallSupport,
): string {
  if (present || support.supported) return baseHint;
  return `${baseHint} · 本平台需手动安装：${support.manualHint}`;
}

/**
 * 按模块整理运行时依赖：每项给出是否就绪、来源说明，以及可用的安装 / 卸载操作。
 * 随应用打包的原生模块只读展示，不提供安装和卸载。
 */
// 保留命名导出，与同目录其他辅助模块一致。
export function buildModuleRuntimes(
  runtime: RuntimeStatusSummary | null,
  embedding: EmbeddingModelStatus | null,
  actions: RuntimeActions,
): Record<ModuleKey, RuntimeInfo[]> {
  if (!runtime) return { stt: [], tts: [], embedding: [], llm: [] };

  const { storageRoot } = runtime;
  const { installSupport } = runtime;
  const { transcription } = runtime;
  const parakeet = runtime.parakeetTranscription;
  const { languageModel } = runtime;
  const speech = runtime.speechSynthesis;

  const ffmpegManaged = Boolean(
    transcription.ffmpegPath &&
      storageRoot &&
      transcription.ffmpegPath.startsWith(storageRoot),
  );

  return {
    stt: [
      {
        key: 'whisper',
        name: 'whisper.cpp',
        present: transcription.whisperCliPresent,
        hint: describeRuntime(
          `Whisper 命令行 · ${describeSource(transcription.runtimeLocation)}`,
          transcription.whisperCliPresent,
          installSupport.whisper,
        ),
        onInstall:
          transcription.whisperCliPresent || !installSupport.whisper.supported
            ? null
            : actions.installWhisper,
        onUninstall:
          transcription.runtimeLocation === 'portable'
            ? () => actions.uninstall('stt', 'whisper')
            : null,
      },
      {
        key: 'ffmpeg',
        name: 'ffmpeg',
        present: transcription.ffmpegPresent,
        hint: describeRuntime(
          transcription.ffmpegPresent
            ? `音频格式转换 · ${ffmpegManaged ? '本应用安装，可卸载' : '来自系统 PATH，需自行卸载'}`
            : '音频格式转换 · 未安装，MP3 / WebM 录音需要它',
          transcription.ffmpegPresent,
          installSupport.ffmpeg,
        ),
        onInstall:
          transcription.ffmpegPresent || !installSupport.ffmpeg.supported
            ? null
            : actions.installFfmpeg,
        onUninstall: ffmpegManaged
          ? () => actions.uninstall('stt', 'ffmpeg')
          : null,
      },
      {
        key: 'sherpa-stt',
        name: 'sherpa-onnx',
        present: parakeet.packageInstalled,
        hint: `Parakeet 识别依赖 · 随应用打包${
          parakeet.packageVersion ? ` · ${parakeet.packageVersion}` : ''
        }`,
        onInstall: null,
        onUninstall: null,
      },
    ],
    tts: speech.runtimes.map((dependency) => ({
      key: `tts:${dependency.id}`,
      name: dependency.name,
      present: dependency.installed,
      hint: dependency.installed
        ? `TTS 推理依赖 · 已就绪${dependency.version ? ` (${dependency.version})` : ''}`
        : 'TTS 推理依赖缺失 · 请在终端执行 npm run postinstall 并重启应用',
      onInstall: null,
      onUninstall: null,
    })),
    embedding: [
      {
        key: 'ollama-embedding',
        name: 'Ollama',
        present: embedding?.serverAvailable ?? languageModel.serverRunning,
        hint: describeRuntime(
          '向量模型与 LLM 共用同一个 Ollama 服务',
          languageModel.binaryPresent,
          installSupport.ollama,
        ),
        onInstall:
          languageModel.binaryPresent || !installSupport.ollama.supported
            ? null
            : actions.installOllama,
        onUninstall: null,
      },
    ],
    llm: [
      {
        key: 'ollama',
        name: 'Ollama',
        present: languageModel.binaryPresent,
        hint: describeRuntime(
          `本地推理服务 · ${describeSource(languageModel.runtimeLocation)}`,
          languageModel.binaryPresent,
          installSupport.ollama,
        ),
        onInstall:
          languageModel.binaryPresent || !installSupport.ollama.supported
            ? null
            : actions.installOllama,
        onUninstall:
          languageModel.runtimeLocation === 'portable'
            ? () => actions.uninstall('llm', 'ollama')
            : null,
      },
      {
        key: 'ollama-server',
        name: '本地服务',
        present: languageModel.serverRunning,
        hint: languageModel.serverRunning
          ? `运行中 · ${languageModel.serverUrl}`
          : '未运行 · 首次对话时会自动拉起',
        onInstall: null,
        onUninstall: null,
      },
    ],
  };
}
