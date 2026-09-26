import { useCallback, useEffect, useState } from 'react';

export type ReadinessComponentId =
  | 'stt'
  | 'tts'
  | 'llm'
  | 'embedding'
  | 'runtime';

export type ReadinessComponent = {
  id: ReadinessComponentId;
  ready: boolean;
  /** 没就绪时给出的具体原因 i18n key，就绪时为空。 */
  reasonKey: string;
};

export type StudioReadiness = {
  loading: boolean;
  ready: boolean;
  components: ReadinessComponent[];
  error: string;
  refresh: () => void;
};

type RuntimeSummary = {
  transcription: {
    ready: boolean;
    whisperCliPresent: boolean;
    ffmpegPresent: boolean;
    activeModelId: string | null;
  };
  parakeetTranscription?: { ready?: boolean; activeModelId?: string | null };
  languageModel: {
    binaryPresent: boolean;
    serverRunning: boolean;
    runtimeReady: boolean;
    activeModelId: string | null;
  };
  speechSynthesis: {
    packageInstalled: boolean;
    runtimeReady: boolean;
    modelReady: boolean;
    activeModelId: string | null;
  };
};

type EmbeddingSummary = { serverAvailable: boolean; installed: boolean };

/** 三个运行时（whisper.cpp + ffmpeg、Ollama 可执行文件、TTS 推理包）单独算一项。 */
function checkRuntime(summary: RuntimeSummary): ReadinessComponent {
  const { transcription, languageModel, speechSynthesis } = summary;
  if (!transcription.whisperCliPresent) {
    return {
      id: 'runtime',
      ready: false,
      reasonKey: 'studio.readiness.reason.whisperRuntime',
    };
  }
  if (!transcription.ffmpegPresent) {
    return {
      id: 'runtime',
      ready: false,
      reasonKey: 'studio.readiness.reason.ffmpeg',
    };
  }
  if (!languageModel.binaryPresent) {
    return {
      id: 'runtime',
      ready: false,
      reasonKey: 'studio.readiness.reason.ollamaRuntime',
    };
  }
  if (!speechSynthesis.packageInstalled || !speechSynthesis.runtimeReady) {
    return {
      id: 'runtime',
      ready: false,
      reasonKey: 'studio.readiness.reason.ttsRuntime',
    };
  }
  return { id: 'runtime', ready: true, reasonKey: '' };
}

function checkStt(summary: RuntimeSummary): ReadinessComponent {
  // 两套转录引擎装好任意一套都算就绪。
  const ready =
    summary.transcription.ready ||
    summary.parakeetTranscription?.ready === true;
  return {
    id: 'stt',
    ready,
    reasonKey: ready ? '' : 'studio.readiness.reason.stt',
  };
}

function checkTts(summary: RuntimeSummary): ReadinessComponent {
  const { speechSynthesis } = summary;
  const ready =
    Boolean(speechSynthesis.activeModelId) &&
    speechSynthesis.modelReady &&
    speechSynthesis.runtimeReady;
  return {
    id: 'tts',
    ready,
    reasonKey: ready ? '' : 'studio.readiness.reason.tts',
  };
}

function checkLlm(summary: RuntimeSummary): ReadinessComponent {
  const { languageModel } = summary;
  const ready =
    languageModel.runtimeReady && Boolean(languageModel.activeModelId);
  return {
    id: 'llm',
    ready,
    reasonKey: ready ? '' : 'studio.readiness.reason.llm',
  };
}

function checkEmbedding(embedding: EmbeddingSummary): ReadinessComponent {
  if (!embedding.serverAvailable) {
    return {
      id: 'embedding',
      ready: false,
      reasonKey: 'studio.readiness.reason.embeddingServer',
    };
  }
  return {
    id: 'embedding',
    ready: embedding.installed,
    reasonKey: embedding.installed ? '' : 'studio.readiness.reason.embedding',
  };
}

/**
 * 对话工作台的开工前检查：STT / TTS / LLM / Embedding / 运行时缺任何一项都不放行。
 * 只读状态，不会顺手去安装任何东西——装什么留给模型管理页。
 */
export default function useStudioReadiness(): StudioReadiness {
  const [components, setComponents] = useState<ReadinessComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setLoading(true);
      setError('');
      try {
        // 走 getReadiness 而不是两个纯读取接口：它会先把 Ollama 拉起来，
        // 否则服务器还没启动时 LLM / Embedding 会被误判成未安装。
        const { runtime, embedding } =
          (await window.electron.runtime.getReadiness()) as {
            runtime: RuntimeSummary;
            embedding: EmbeddingSummary;
          };
        if (cancelled) return;
        setComponents([
          checkStt(runtime),
          checkTts(runtime),
          checkLlm(runtime),
          checkEmbedding(embedding),
          checkRuntime(runtime),
        ]);
      } catch (reason) {
        if (cancelled) return;
        // 查不到状态时同样不放行，否则又回到「静默失败」那种体验。
        setComponents([]);
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return {
    loading,
    ready: components.length > 0 && components.every((item) => item.ready),
    components,
    error,
    refresh,
  };
}
