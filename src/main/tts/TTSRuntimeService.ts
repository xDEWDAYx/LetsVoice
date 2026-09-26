import fs from 'fs';
import path from 'path';
import type {
  TTSRuntimeDependencyStatus,
  TTSRuntimeStatus,
} from '@shared/types/TTSRuntimeTypes';
import TTSModelManager from '../AI-module/TTSModelManager';
import { ManagedPaths } from '../runtime/ManagedPaths';
import { requireAtRuntime } from '../runtime/RuntimeRequire';
import {
  getTTSModelCatalogItem,
  KOKORO_TTS_MODEL_ID,
  MELO_TTS_MODEL_ID,
  MOSS_TTS_MODEL_ID,
  TTSBackend,
} from './TTSModelCatalog';
import TTSModelStorage from './TTSModelStorage';
import { getTTSSpeakers } from './TTSVoices';

export const TTS_SAMPLE_RATE = 24_000;

type PackageResolver = (packageName: string) => {
  installed: boolean;
  version: string | null;
};

/** 只读检查当前激活的 TTS 模型和随应用打包的推理依赖。 */
export default class TTSRuntimeService {
  private readonly paths: ManagedPaths;

  private readonly manager: TTSModelManager;

  private readonly storage: TTSModelStorage;

  private readonly resolvePackage: PackageResolver;

  public constructor(
    paths = ManagedPaths.getInstance(),
    resolvePackage: PackageResolver = TTSRuntimeService.resolvePackage,
    manager = new TTSModelManager({ managedPaths: paths }),
  ) {
    this.paths = paths;
    this.manager = manager;
    this.storage = new TTSModelStorage(paths.getRuntimePaths('tts').modelsRoot);
    this.resolvePackage = resolvePackage;
  }

  public getModelDir(modelId?: string | null): string | null {
    const resolvedId = modelId ?? this.manager.getActivatedModel()?.id;
    if (!resolvedId) return null;
    return this.storage.getInstallPath(getTTSModelCatalogItem(resolvedId));
  }

  public getRequiredFiles(modelId?: string | null): Record<string, string> {
    const resolvedId = modelId ?? this.manager.getActivatedModel()?.id;
    if (!resolvedId) return {};
    const item = getTTSModelCatalogItem(resolvedId);
    const modelDir = this.storage.getInstallPath(item);
    return Object.fromEntries(
      item.requiredFiles.map((relativePath) => [
        relativePath,
        path.join(modelDir, relativePath),
      ]),
    );
  }

  public getStatus(): TTSRuntimeStatus {
    const models = this.manager.getModelList();
    const active = models.find((model) => model.activated) ?? null;
    const activeItem = active ? getTTSModelCatalogItem(active.id) : null;
    const modelDir = activeItem
      ? this.storage.getInstallPath(activeItem)
      : null;
    const missingFiles = activeItem
      ? this.storage.getMissingFiles(activeItem)
      : [];
    const runtimes = this.getRuntimeDependencies();
    const dependencyReady = activeItem
      ? TTSRuntimeService.isBackendAvailable(activeItem.engine, runtimes)
      : false;
    const speakers = activeItem ? getTTSSpeakers(activeItem.id, modelDir) : [];
    const defaultSpeakerId =
      speakers.find((speaker) => speaker.isDefault)?.id ??
      speakers[0]?.id ??
      null;
    const sherpa = runtimes.find(
      (runtime) => runtime.id === 'sherpa-onnx-node',
    );

    return {
      runtimeName: 'local-onnx',
      activeModelId: activeItem?.id ?? null,
      activeBackend: activeItem?.engine ?? null,
      modelName: activeItem?.name ?? null,
      modelDir,
      packageInstalled: dependencyReady,
      packageVersion: sherpa?.version ?? null,
      modelReady: Boolean(activeItem && missingFiles.length === 0),
      runtimeReady: Boolean(
        activeItem && missingFiles.length === 0 && dependencyReady,
      ),
      missingFiles,
      speakers,
      defaultSpeakerId,
      sampleRate: TTSRuntimeService.getExpectedSampleRate(activeItem?.id),
      manifestPresent: fs.existsSync(
        this.paths.getRuntimePaths('tts').manifestPath,
      ),
      installedModelCount: models.filter((model) => model.downloaded).length,
      runtimes,
    };
  }

  private getRuntimeDependencies(): TTSRuntimeDependencyStatus[] {
    const definitions = [
      ['sherpa-onnx-node', 'sherpa-onnx'],
      ['onnxruntime-node', 'ONNX Runtime'],
      ['@sctg/sentencepiece-js', 'SentencePiece'],
    ] as const;
    return definitions.map(([packageName, name]) => ({
      id:
        packageName === '@sctg/sentencepiece-js'
          ? 'sentencepiece-js'
          : packageName,
      name,
      ...this.resolvePackage(packageName),
    }));
  }

  private static isBackendAvailable(
    backend: TTSBackend,
    runtimes: TTSRuntimeDependencyStatus[],
  ): boolean {
    const installed = (id: TTSRuntimeDependencyStatus['id']) =>
      runtimes.some((runtime) => runtime.id === id && runtime.installed);
    if (backend === 'moss-onnx') {
      return installed('onnxruntime-node') && installed('sentencepiece-js');
    }
    return installed('sherpa-onnx-node');
  }

  private static getExpectedSampleRate(modelId?: string): number {
    if (modelId === MOSS_TTS_MODEL_ID) return 48_000;
    if (modelId === MELO_TTS_MODEL_ID) return 44_100;
    if (modelId === KOKORO_TTS_MODEL_ID) return 24_000;
    return TTS_SAMPLE_RATE;
  }

  private static resolvePackage(packageName: string): {
    installed: boolean;
    version: string | null;
  } {
    try {
      const info = requireAtRuntime<{ version?: string }>(
        `${packageName}/package.json`,
      );
      return { installed: true, version: info.version ?? null };
    } catch {
      // sentencepiece-js 不导出 package.json，因此用公开入口仅检查可加载性。
      try {
        requireAtRuntime(packageName);
        return { installed: true, version: null };
      } catch {
        return { installed: false, version: null };
      }
    }
  }
}
