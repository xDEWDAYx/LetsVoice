import fs from 'fs';
import path from 'path';
import type { TTSRuntimeStatus } from '@shared/types/TTSRuntimeTypes';
import type {
  ManagedRuntimeState,
  RuntimeComponentStatus,
  RuntimeStatusSummary,
} from '@shared/types/RuntimeTypes';
import { ManagedPaths, RuntimeKind, RuntimeStoragePaths } from './ManagedPaths';
import WhisperRuntimeService from '../transcription/WhisperRuntimeService';
import OllamaRuntimeService from '../llm/OllamaRuntimeService';
import TTSRuntimeService from '../tts/TTSRuntimeService';
import ParakeetRuntimeService from '../transcription/ParakeetRuntimeService';
import { getRuntimeInstallSupportSummary } from './RuntimeInstallSupport';

export type {
  ManagedRuntimeState,
  RuntimeComponentStatus,
  RuntimeStatusSummary,
};

/**
 * 汇总应用自己管理的运行时和模型状态。
 * 此服务只读文件系统，不会在状态查询时创建、下载或删除文件。
 */
export class RuntimeStatusService {
  private readonly managedPaths: ManagedPaths;

  private readonly whisperRuntime: WhisperRuntimeService;

  private readonly ollamaRuntime: OllamaRuntimeService;

  private readonly ttsRuntime: TTSRuntimeService;

  private readonly parakeetRuntime: ParakeetRuntimeService;

  public constructor(
    managedPaths = ManagedPaths.getInstance(),
    whisperRuntime = new WhisperRuntimeService(managedPaths),
    ollamaRuntime = new OllamaRuntimeService(),
    ttsRuntime = new TTSRuntimeService(managedPaths),
    parakeetRuntime = new ParakeetRuntimeService(),
  ) {
    this.managedPaths = managedPaths;
    this.whisperRuntime = whisperRuntime;
    this.ollamaRuntime = ollamaRuntime;
    this.ttsRuntime = ttsRuntime;
    this.parakeetRuntime = parakeetRuntime;
  }

  public async getStatus(): Promise<RuntimeStatusSummary> {
    const kinds: RuntimeKind[] = ['stt', 'llm', 'tts'];
    const speechSynthesis = this.ttsRuntime.getStatus();

    return {
      storageRoot: this.managedPaths.getDataRoot(),
      components: kinds.map((kind) =>
        kind === 'tts'
          ? RuntimeStatusService.getTTSComponentStatus(speechSynthesis)
          : this.getComponentStatus(kind),
      ),
      transcription: this.whisperRuntime.getStatus(),
      parakeetTranscription: this.parakeetRuntime.getStatus(),
      languageModel: await this.ollamaRuntime.getStatus(),
      speechSynthesis,
      installSupport: getRuntimeInstallSupportSummary(),
    };
  }

  private static getTTSComponentStatus(
    status: TTSRuntimeStatus,
  ): RuntimeComponentStatus {
    const { installedModelCount } = status;
    const hasPartialState =
      status.runtimes.some((runtime) => runtime.installed) ||
      installedModelCount > 0;
    let managedState: ManagedRuntimeState = 'missing';
    if (hasPartialState) managedState = 'partial';
    if (status.runtimeReady) managedState = 'ready';
    return {
      kind: 'tts',
      managedState,
      runtimePresent: status.runtimes.some((runtime) => runtime.installed),
      manifestPresent: status.manifestPresent,
      installedModelCount,
    };
  }

  private getComponentStatus(kind: RuntimeKind): RuntimeComponentStatus {
    const runtimePaths = this.managedPaths.getRuntimePaths(kind);
    const runtimeEntries = RuntimeStatusService.readDirectory(
      runtimePaths.runtimeRoot,
    ).filter(
      (entryName) =>
        path.join(runtimePaths.runtimeRoot, entryName) !==
        runtimePaths.manifestPath,
    );
    const installedModelCount = RuntimeStatusService.countModels(runtimePaths);
    const runtimePresent = runtimeEntries.length > 0;
    const manifestPresent = fs.existsSync(runtimePaths.manifestPath);

    let managedState: ManagedRuntimeState = 'missing';
    if (runtimePresent && installedModelCount > 0) {
      managedState = 'ready';
    } else if (runtimePresent || manifestPresent || installedModelCount > 0) {
      managedState = 'partial';
    }

    return {
      kind,
      managedState,
      runtimePresent,
      manifestPresent,
      installedModelCount,
    };
  }

  private static countModels(runtimePaths: RuntimeStoragePaths): number {
    return RuntimeStatusService.readDirectory(runtimePaths.modelsRoot).length;
  }

  private static readDirectory(directory: string): string[] {
    try {
      return fs.readdirSync(directory);
    } catch {
      // 目录未创建或暂时不可读都按空目录处理，避免阻止设置页面加载。
      return [];
    }
  }
}
