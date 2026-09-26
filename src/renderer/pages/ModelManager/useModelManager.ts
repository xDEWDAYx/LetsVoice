import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Model } from '@shared/models/Model';
import type { ModelDownloadProgressEvent } from '@shared/types/ModelManagementTypes';
import type { RuntimeStatusSummary } from '@shared/types/RuntimeTypes';
import type { EmbeddingModelStatus } from '@shared/types/SemanticTypes';
import {
  ModelRecommendation,
  ModelRecommendationController,
} from './ModelRecommendationController';

export type ModuleKey = 'stt' | 'tts' | 'embedding' | 'llm';

export type ModuleProgress = { message: string; percent: number | null };

export type ModelOperationState = {
  busy: boolean;
  progress: ModuleProgress | null;
  error: string;
};

export type ModelOperations = Partial<
  Record<ModuleKey, Record<string, ModelOperationState>>
>;

type ByteProgress = {
  message?: string;
  receivedBytes?: number;
  totalBytes?: number;
};

function toPercent(received?: number, total?: number): number | null {
  if (!received || !total) return null;
  return Math.round((received / total) * 100);
}

/**
 * 模型管理页的数据层：四个模块的模型列表、运行时状态、安装进度与错误。
 * 页面组件只负责展示，所有 IPC 调用集中在这里。
 */
export default function useModelManager() {
  const [sttModels, setSttModels] = useState<Model[]>([]);
  const [ttsModels, setTtsModels] = useState<Model[]>([]);
  const [llmModels, setLlmModels] = useState<Model[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatusSummary | null>(null);
  const [embedding, setEmbedding] = useState<EmbeddingModelStatus | null>(null);
  const [recommendation, setRecommendation] =
    useState<ModelRecommendation | null>(null);

  // 首屏加载：读四类模型列表和运行时状态期间，页面必须给出反馈，
  // 不能只留一片空白。注意这个标志只等「必备数据」，
  // 不等下面那个要探测显卡的硬件推荐。
  const [initialLoading, setInitialLoading] = useState(true);
  // 推荐单独一个标志：内容已经渲染出来了，只是「推荐」标签还没算完。
  const [recommendationLoading, setRecommendationLoading] = useState(true);
  const activeOperations = useRef(new Set<string>());
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const [modelOperations, setModelOperations] = useState<ModelOperations>({});
  const [errors, setErrors] = useState<Partial<Record<ModuleKey, string>>>({});
  const [progress, setProgress] = useState<
    Partial<Record<ModuleKey, ModuleProgress | null>>
  >({});

  // 控制器读 window.electron，必须在组件内部创建：
  // 模块顶层 new 会让 preload 尚未注入的环境（例如 jest jsdom）在 import 阶段就崩溃。
  const recommendationController = useMemo(
    () => new ModelRecommendationController(),
    [],
  );

  const setError = useCallback((module: ModuleKey, message: string) => {
    setErrors((current) => ({ ...current, [module]: message }));
  }, []);

  const loadRuntime = useCallback(async () => {
    const next = (await window.electron.runtime.getStatus()) as
      | RuntimeStatusSummary
      | undefined;
    if (next) setRuntime(next);
  }, []);

  const loadEmbedding = useCallback(async () => {
    const next = (await window.electron.semantic.getStatus()) as
      | EmbeddingModelStatus
      | undefined;
    if (next) setEmbedding(next);
  }, []);

  const loadModels = useCallback(async () => {
    const [stt, tts, llm] = await Promise.all([
      window.electron.modelManagement.getModelList('stt'),
      window.electron.modelManagement.getModelList('tts'),
      window.electron.modelManagement.getModelList('llm'),
    ]);
    setSttModels(stt);
    setTtsModels(tts);
    setLlmModels(llm);
    return { stt, tts, llm };
  }, []);

  /**
   * 页面真正需要才能渲染的数据：四类模型列表 + 运行时 + 向量模型状态。
   * 这些都是读本地文件和进程状态，很快。
   */
  const loadEssentials = useCallback(async () => {
    const { stt, llm } = await loadModels();
    await Promise.all([loadRuntime(), loadEmbedding()]);
    return { stt, llm };
  }, [loadModels, loadRuntime, loadEmbedding]);

  /**
   * 硬件推荐是「锦上添花」：它要在主进程里 spawn nvidia-smi / WMI 探测显卡，
   * 单次可能好几秒。绝对不能让它挡住首屏 —— 它只是给下拉项加一个「推荐」标签，
   * 没有它页面照样是完整可用的。所以单独拉，回来了再合并进去。
   */
  const loadRecommendation = useCallback(
    async (stt: Model[], llm: Model[]) => {
      setRecommendationLoading(true);
      try {
        setRecommendation(
          await recommendationController.getRecommendation(stt, llm),
        );
      } catch {
        // 推荐只是下拉里的一个标签，检测失败时静默降级。
        setRecommendation(null);
      } finally {
        setRecommendationLoading(false);
      }
    },
    [recommendationController],
  );

  const refreshAll = useCallback(async () => {
    const { stt, llm } = await loadEssentials();
    await loadRecommendation(stt, llm);
  }, [loadEssentials, loadRecommendation]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const { stt, llm } = await loadEssentials();
        if (cancelled) return;
        // 必备数据到齐就立刻放行渲染，硬件探测留在后台继续跑。
        setInitialLoading(false);
        await loadRecommendation(stt, llm);
      } catch (reason) {
        if (cancelled) return;
        setError(
          'stt',
          reason instanceof Error ? reason.message : '读取状态失败',
        );
        // 出错也要收起两个加载态，否则页面永远停在骨架上，
        // 而推荐这条路径压根没跑起来，也不会有人去把它置回 false。
        setInitialLoading(false);
        setRecommendationLoading(false);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadEssentials, loadRecommendation, setError]);

  useEffect(() => {
    const track =
      (module: ModuleKey) =>
      (raw: unknown): void => {
        const value = raw as ByteProgress;
        setProgress((current) => ({
          ...current,
          [module]: {
            message: value.message ?? '正在安装…',
            percent: toPercent(value.receivedBytes, value.totalBytes),
          },
        }));
      };

    const unsubscribes = [
      window.electron.modelManagement.onDownloadProgress(
        (value: ModelDownloadProgressEvent) => {
          setModelOperations((current) => {
            const moduleOperations = current[value.modelType] ?? {};
            const operation = moduleOperations[value.modelId];
            const operationKey = `${value.modelType}:${value.modelId}`;
            if (
              !operation?.busy &&
              !activeOperations.current.has(operationKey)
            ) {
              return current;
            }
            return {
              ...current,
              [value.modelType]: {
                ...moduleOperations,
                [value.modelId]: {
                  busy: true,
                  error: operation?.error ?? '',
                  progress: {
                    message: value.message,
                    percent: toPercent(
                      value.receivedBytes,
                      value.totalBytes ?? undefined,
                    ),
                  },
                },
              },
            };
          });
        },
      ),
      window.electron.runtime.onInstallProgress(track('stt')),
      window.electron.runtime.onFfmpegInstallProgress(track('stt')),
      window.electron.runtime.onOllamaInstallProgress(track('llm')),
      window.electron.runtime.onTTSInstallProgress(track('tts')),
      window.electron.semantic.onInstallProgress((raw) => {
        const value = raw as {
          status?: string;
          completed: number;
          total: number;
        };
        setProgress((current) => ({
          ...current,
          embedding: {
            message: value.status ?? '正在下载…',
            percent: toPercent(value.completed, value.total),
          },
        }));
      }),
    ];
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, []);

  /** 统一的操作外壳：置忙、清错、跑操作、刷新、收尾。 */
  const run = useCallback(
    async (
      module: ModuleKey,
      key: string,
      operation: () => Promise<unknown>,
      fallbackMessage: string,
      modelId?: string,
    ) => {
      const operationKey = `${module}:${key}`;
      if (activeOperations.current.has(operationKey)) return;
      activeOperations.current.add(operationKey);
      setBusyKeys([...activeOperations.current]);
      if (modelId) {
        setModelOperations((current) => ({
          ...current,
          [module]: {
            ...current[module],
            [modelId]: { busy: true, progress: null, error: '' },
          },
        }));
      } else {
        setErrors((current) => ({ ...current, [module]: '' }));
      }
      let failureMessage: string | null = null;
      try {
        await operation();
        await refreshAll();
      } catch (reason) {
        failureMessage =
          reason instanceof Error ? reason.message : fallbackMessage;
        if (!modelId) setError(module, failureMessage);
      } finally {
        activeOperations.current.delete(operationKey);
        setBusyKeys([...activeOperations.current]);
        if (modelId) {
          setModelOperations((current) => {
            const moduleOperations = { ...current[module] };
            if (failureMessage) {
              moduleOperations[modelId] = {
                busy: false,
                progress: null,
                error: failureMessage,
              };
            } else {
              delete moduleOperations[modelId];
            }
            return { ...current, [module]: moduleOperations };
          });
        } else {
          setProgress((current) => ({ ...current, [module]: null }));
        }
      }
    },
    [refreshAll, setError],
  );

  const modelActions = useCallback(
    (module: 'stt' | 'tts' | 'llm') => ({
      select: (id: string) =>
        run(
          module,
          id,
          () => window.electron.modelManagement.activateModel(module, id),
          '切换模型失败',
          id,
        ),
      download: (id: string) =>
        run(
          module,
          id,
          () => window.electron.modelManagement.downloadModel(module, id),
          '下载模型失败',
          id,
        ),
      remove: (id: string) =>
        run(
          module,
          id,
          () => window.electron.modelManagement.deleteModel(module, id),
          '删除模型失败',
          id,
        ),
    }),
    [run],
  );

  return {
    initialLoading,
    recommendationLoading,
    sttModels,
    ttsModels,
    llmModels,
    runtime,
    embedding,
    recommendation,
    busyKeys,
    modelOperations,
    errors,
    progress,
    refreshAll,
    stt: modelActions('stt'),
    tts: modelActions('tts'),
    llm: modelActions('llm'),
    installWhisper: () =>
      run(
        'stt',
        'runtime:whisper',
        () => window.electron.runtime.installWhisper(),
        'Whisper 运行时安装失败',
      ),
    installFfmpeg: () =>
      run(
        'stt',
        'runtime:ffmpeg',
        () => window.electron.runtime.installFfmpeg(),
        'ffmpeg 安装失败',
      ),
    installOllama: () =>
      run(
        'llm',
        'runtime:ollama',
        () => window.electron.runtime.installOllama(),
        'Ollama 运行时安装失败',
      ),
    installEmbedding: () =>
      run(
        'embedding',
        'embedding:model',
        () => window.electron.semantic.installModel(),
        'Embedding 模型安装失败',
      ),
    /** 卸载应用自己下载的运行时；系统安装的副本由主进程拒绝并回报原因。 */
    uninstallRuntime: (module: ModuleKey, target: string) =>
      run(
        module,
        `uninstall:${target}`,
        () => window.electron.runtime.uninstall(target),
        '卸载失败',
      ),
  };
}
