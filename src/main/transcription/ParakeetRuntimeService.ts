import fs from 'fs';
import path from 'path';
import type { ParakeetRuntimeStatus } from '@shared/types/RuntimeTypes';
import { STTModelManager } from '../AI-module/STTModelManager';
import { resolveFfmpegPath } from '../runtime/FfmpegLocator';
import { requireAtRuntime } from '../runtime/RuntimeRequire';
import ParakeetModelArchive, {
  PARAKEET_REQUIRED_FILES,
} from './ParakeetModelArchive';
import { PARAKEET_ENGINE } from './STTModelCatalog';

export type { ParakeetRuntimeStatus };

type PackageResolver = () => { installed: boolean; version: string | null };

/** 只读检查 Parakeet 原生依赖、激活模型目录和音频转换工具。 */
export default class ParakeetRuntimeService {
  private readonly models: STTModelManager;

  private readonly resolvePackage: PackageResolver;

  public constructor(
    models = new STTModelManager(),
    resolvePackage = ParakeetRuntimeService.resolvePackage,
  ) {
    this.models = models;
    this.resolvePackage = resolvePackage;
  }

  public getStatus(): ParakeetRuntimeStatus {
    const activeModel = this.models.getActivatedModel();
    const modelDir =
      activeModel?.engine === PARAKEET_ENGINE
        ? this.models.getActivatedModelPath()
        : null;
    const requiredFiles = ParakeetRuntimeService.getRequiredFiles(modelDir);
    const missingFiles = Object.entries(requiredFiles)
      .filter(([, filePath]) => !fs.existsSync(filePath))
      .map(([name]) => name);
    const packageInfo = this.resolvePackage();
    return {
      ready:
        packageInfo.installed &&
        modelDir !== null &&
        ParakeetModelArchive.isComplete(modelDir),
      packageInstalled: packageInfo.installed,
      packageVersion: packageInfo.version,
      activeModelId: modelDir ? (activeModel?.id ?? null) : null,
      activeModelName: modelDir ? (activeModel?.name ?? null) : null,
      modelDir,
      modelType: 'nemo_transducer',
      requiredFiles,
      missingFiles,
      ffmpegPath: resolveFfmpegPath(),
    };
  }

  public requireReady(): ParakeetRuntimeStatus {
    const status = this.getStatus();
    if (!status.packageInstalled) {
      throw new Error('Parakeet 原生依赖未安装在 release/app 中');
    }
    if (!status.modelDir || status.missingFiles.length > 0) {
      throw new Error('请先下载并激活 Parakeet 模型');
    }
    return status;
  }

  private static getRequiredFiles(
    modelDir: string | null,
  ): Record<string, string> {
    return Object.fromEntries(
      PARAKEET_REQUIRED_FILES.map((fileName) => [
        fileName,
        modelDir ? path.join(modelDir, fileName) : '',
      ]),
    );
  }

  private static resolvePackage(): {
    installed: boolean;
    version: string | null;
  } {
    try {
      const info = requireAtRuntime<{
        version?: string;
      }>('sherpa-onnx-node/package.json');
      return { installed: true, version: info.version ?? null };
    } catch {
      return { installed: false, version: null };
    }
  }
}
