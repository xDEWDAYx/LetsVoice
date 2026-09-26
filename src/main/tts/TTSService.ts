import type { TTSAudioResult, TTSBackend } from '@shared/types/TTSRuntimeTypes';
import TTSRuntimeService from './TTSRuntimeService';
import TTSEngine from './TTSEngine';
import { normalizeTTSInput } from './TTSInput';

export type { TTSAudioResult };

/** 验证当前激活模型、运行时和输入后执行本地合成，结果不写入磁盘。 */
export default class TTSService {
  private readonly runtime: TTSRuntimeService;

  private readonly engine: TTSEngine;

  public constructor(
    runtime = new TTSRuntimeService(),
    engine = new TTSEngine(),
  ) {
    this.runtime = runtime;
    this.engine = engine;
  }

  public async synthesize(
    rawText: unknown,
    rawOptions: unknown,
  ): Promise<TTSAudioResult> {
    const status = this.runtime.getStatus();
    if (!status.activeModelId) {
      throw new Error('请先在模型管理中选择 TTS 模型');
    }
    if (!status.runtimeReady || !status.modelDir || !status.modelName) {
      throw new Error(
        `当前 TTS 模型未就绪: ${status.missingFiles.join(', ') || '推理依赖缺失'}`,
      );
    }
    const input = normalizeTTSInput(rawText, rawOptions, status.speakers);
    const speaker = status.speakers.find(
      (candidate) => candidate.id === input.speakerId,
    );
    if (!speaker) throw new Error('TTS 音色不存在 / Speaker not found');
    const audio = await this.engine.generate(
      status.activeModelId,
      status.modelDir,
      input.text,
      input.speakerId,
      input.speed,
    );
    if (audio.channels.length < 1 || audio.channels.length > 2) {
      throw new Error('TTS 返回了不支持的声道数');
    }
    const frameLength = audio.channels[0]?.length ?? 0;
    if (
      frameLength === 0 ||
      audio.channels.some((channel) => channel.length !== frameLength)
    ) {
      throw new Error('TTS 返回的音频声道不完整');
    }
    return {
      source: 'local',
      backend: status.activeBackend as TTSBackend,
      modelId: status.activeModelId,
      modelName: status.modelName,
      speakerId: speaker.id,
      speakerName: speaker.name,
      sampleRate: audio.sampleRate,
      channelCount: audio.channels.length,
      channelData: audio.channels,
    };
  }

  public dispose(): void {
    this.engine.dispose();
  }
}
