import fs from 'fs';
import path from 'path';
import type {
  WhisperRuntimeLocation,
  WhisperRuntimeStatus,
} from '@shared/types/RuntimeTypes';
import { STTModelManager } from '../AI-module/STTModelManager';
import CommandLocator from '../runtime/CommandLocator';
import { resolveFfmpegPath } from '../runtime/FfmpegLocator';
import { ManagedPaths } from '../runtime/ManagedPaths';

export type { WhisperRuntimeLocation, WhisperRuntimeStatus };

/** 查找本机 Whisper CLI、音频转换工具和当前已激活模型。 */
export default class WhisperRuntimeService {
  private readonly managedPaths: ManagedPaths;

  private readonly modelManager: STTModelManager;

  public constructor(
    managedPaths = ManagedPaths.getInstance(),
    modelManager = new STTModelManager({ managedPaths }),
  ) {
    this.managedPaths = managedPaths;
    this.modelManager = modelManager;
  }

  public getStatus(): WhisperRuntimeStatus {
    const portableBinDir = this.getPortableBinDir();
    const portableCandidates =
      process.platform === 'win32'
        ? ['whisper-cli.exe', 'main.exe']
        : ['whisper-cli', 'main'];
    const portablePath = portableCandidates
      .map((candidate) => path.join(portableBinDir, candidate))
      .find((candidate) => fs.existsSync(candidate));
    const systemPath = portablePath
      ? null
      : CommandLocator.resolve(['whisper-cli', 'whisper-cli.exe']);
    const whisperCliPath =
      portablePath ??
      systemPath ??
      path.join(portableBinDir, portableCandidates[0]);
    let runtimeLocation: WhisperRuntimeLocation = 'missing';
    if (portablePath) runtimeLocation = 'portable';
    else if (systemPath) runtimeLocation = 'system-path';
    const activeModel = this.modelManager.getActivatedModel();
    const activeModelPath =
      activeModel?.engine === 'whisper.cpp'
        ? this.modelManager.getActivatedModelPath()
        : null;
    const ffmpegPath = resolveFfmpegPath(this.managedPaths);

    return {
      ready: runtimeLocation !== 'missing' && activeModelPath !== null,
      runtimeLocation,
      whisperCliPath,
      whisperCliPresent: runtimeLocation !== 'missing',
      ffmpegPath,
      ffmpegPresent: ffmpegPath !== null,
      activeModelId: activeModelPath ? (activeModel?.id ?? null) : null,
      activeModelName: activeModelPath ? (activeModel?.name ?? null) : null,
      activeModelPath,
    };
  }

  public requireReady(): WhisperRuntimeStatus {
    const status = this.getStatus();
    if (!status.whisperCliPresent) {
      throw new Error(
        '未找到 whisper-cli，请先安装本地运行时 / whisper-cli is not installed',
      );
    }
    if (!status.activeModelPath) {
      throw new Error(
        '请先下载并激活一个 STT 模型 / Download and activate an STT model first',
      );
    }

    return status;
  }

  public getPortableBinDir(): string {
    const { runtimeRoot } = this.managedPaths.getRuntimePaths('stt');
    return path.join(runtimeRoot, 'whisper', 'bin');
  }
}
