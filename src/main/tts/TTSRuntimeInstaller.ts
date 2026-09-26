import type { TTSRuntimeStatus } from '@shared/types/TTSRuntimeTypes';
import TTSModelManager from '../AI-module/TTSModelManager';
import { ManagedPaths } from '../runtime/ManagedPaths';
import { TTSInstallProgress } from './TTSInstallSupport';
import { KOKORO_TTS_MODEL_ID } from './TTSModelCatalog';
import TTSRuntimeService from './TTSRuntimeService';

/** 兼容旧的 Runtime:installTTS IPC；新页面统一使用 TTSModelManager。 */
export default class TTSRuntimeInstaller {
  private installPromise: Promise<TTSRuntimeStatus> | null = null;

  private readonly manager: TTSModelManager;

  private readonly runtime: TTSRuntimeService;

  public constructor(paths = ManagedPaths.getInstance()) {
    this.manager = new TTSModelManager({ managedPaths: paths });
    this.runtime = new TTSRuntimeService(paths);
  }

  public install(
    onProgress?: (progress: TTSInstallProgress) => void,
  ): Promise<TTSRuntimeStatus> {
    if (this.installPromise) return this.installPromise;
    this.installPromise = this.installKokoro(onProgress).finally(() => {
      this.installPromise = null;
    });
    return this.installPromise;
  }

  private async installKokoro(
    onProgress?: (progress: TTSInstallProgress) => void,
  ): Promise<TTSRuntimeStatus> {
    const existing = this.manager
      .getModelList()
      .find((model) => model.id === KOKORO_TTS_MODEL_ID);
    if (!existing?.downloaded) {
      await this.manager.downloadModel(KOKORO_TTS_MODEL_ID, onProgress);
    }
    return this.runtime.getStatus();
  }
}
