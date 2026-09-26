import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { ManagedPaths } from './ManagedPaths';
import { getManagedFfmpegDir } from './FfmpegLocator';
import WhisperRuntimeService from '../transcription/WhisperRuntimeService';
import OllamaRuntimeLocator from '../llm/OllamaRuntimeLocator';
import TTSRuntimeService from '../tts/TTSRuntimeService';

export type UninstallTarget = 'whisper' | 'ffmpeg' | 'ollama' | 'tts-model';

export type UninstallResult = {
  removed: boolean;
  message: string;
};

type Dependencies = {
  managedPaths?: ManagedPaths;
  whisperRuntime?: WhisperRuntimeService;
  ollamaLocator?: OllamaRuntimeLocator;
  ttsRuntime?: TTSRuntimeService;
};

/**
 * 卸载应用自己下载到 userData 里的运行时和大模型文件。
 * 系统自带或用户手动安装的副本一律不碰，只提示用户自行处理。
 */
export default class RuntimeUninstallService {
  private readonly managedPaths: ManagedPaths;

  private readonly whisperRuntime: WhisperRuntimeService;

  private readonly ollamaLocator: OllamaRuntimeLocator;

  private readonly ttsRuntime: TTSRuntimeService;

  public constructor(dependencies: Dependencies = {}) {
    this.managedPaths = dependencies.managedPaths ?? ManagedPaths.getInstance();
    this.whisperRuntime =
      dependencies.whisperRuntime ??
      new WhisperRuntimeService(this.managedPaths);
    this.ollamaLocator =
      dependencies.ollamaLocator ??
      new OllamaRuntimeLocator({ managedPaths: this.managedPaths });
    this.ttsRuntime =
      dependencies.ttsRuntime ?? new TTSRuntimeService(this.managedPaths);
  }

  public async uninstall(target: UninstallTarget): Promise<UninstallResult> {
    if (target === 'whisper') return this.uninstallWhisper();
    if (target === 'ffmpeg') return this.uninstallFfmpeg();
    if (target === 'ollama') return this.uninstallOllama();
    if (target === 'tts-model') return this.uninstallTTSModel();
    throw new Error(`未知的卸载目标 / Unknown uninstall target: ${target}`);
  }

  private async uninstallWhisper(): Promise<UninstallResult> {
    const status = this.whisperRuntime.getStatus();
    if (status.runtimeLocation === 'system-path') {
      throw new Error(
        'Whisper 来自系统 PATH，请自行卸载 / Whisper comes from system PATH',
      );
    }
    if (status.runtimeLocation === 'missing') {
      return { removed: false, message: 'Whisper 运行时未安装' };
    }

    // 便携版目录为 runtimes/stt/whisper/bin，整体移除它的上一级。
    const whisperRoot = path.dirname(this.whisperRuntime.getPortableBinDir());
    return this.removeManagedDirectory(whisperRoot, 'Whisper 运行时');
  }

  private async uninstallFfmpeg(): Promise<UninstallResult> {
    const managedDir = getManagedFfmpegDir(this.managedPaths);
    if (!fsSync.existsSync(managedDir)) {
      throw new Error(
        'ffmpeg 不是由本应用安装的，请自行卸载 / ffmpeg was not installed by this app',
      );
    }
    return this.removeManagedDirectory(path.dirname(managedDir), 'ffmpeg');
  }

  private async uninstallOllama(): Promise<UninstallResult> {
    const binary = this.ollamaLocator.locate();
    if (binary.location === 'installed' || binary.location === 'system-path') {
      throw new Error(
        'Ollama 由系统安装，请在系统里卸载 / Ollama was installed outside this app',
      );
    }
    if (binary.location === 'missing') {
      return { removed: false, message: 'Ollama 运行时未安装' };
    }

    const { runtimeRoot } = this.managedPaths.getRuntimePaths('llm');
    return this.removeManagedDirectory(runtimeRoot, 'Ollama 运行时');
  }

  private async uninstallTTSModel(): Promise<UninstallResult> {
    const modelDir = this.ttsRuntime.getModelDir();
    if (!modelDir || !fsSync.existsSync(modelDir)) {
      return { removed: false, message: '语音模型未安装' };
    }
    throw new Error('正在使用的 TTS 模型无法删除，请先在模型管理中切换模型');
  }

  /** 删除前统一校验路径仍在 userData 内，避免误删应用目录之外的内容。 */
  private async removeManagedDirectory(
    directory: string,
    label: string,
  ): Promise<UninstallResult> {
    if (!this.managedPaths.isManagedPath(directory)) {
      throw new Error(`${label} 不在应用受管目录中，已取消删除`);
    }
    await fs.rm(directory, { recursive: true, force: true });
    return { removed: true, message: `${label} 已卸载` };
  }
}
