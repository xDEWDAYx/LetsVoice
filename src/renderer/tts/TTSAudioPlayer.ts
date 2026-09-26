import type { TTSAudioResult } from '@shared/types/TTSRuntimeTypes';

/** 把主进程返回的 1–2 声道 PCM 样本交给 Web Audio 完整播放。 */
export default class TTSAudioPlayer {
  private context: AudioContext | null = null;

  private source: AudioBufferSourceNode | null = null;

  private resolvePlayback: (() => void) | null = null;

  public async play(audio: TTSAudioResult): Promise<void> {
    this.stop();
    const context = new AudioContext();
    const channels = audio.channelData.map((channel) =>
      Float32Array.from(channel),
    );
    if (
      channels.length < 1 ||
      channels.length > 2 ||
      channels.some((channel) => channel.length !== channels[0].length)
    ) {
      await context.close();
      throw new Error('TTS 音频声道数据无效');
    }
    const buffer = context.createBuffer(
      channels.length,
      channels[0].length,
      audio.sampleRate,
    );
    channels.forEach((samples, index) => buffer.copyToChannel(samples, index));
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.context = context;
    this.source = source;
    await context.resume();
    return new Promise<void>((resolve, reject) => {
      this.resolvePlayback = resolve;
      source.onended = () => {
        if (this.source === source) {
          this.source = null;
          this.context = null;
        }
        const finish = this.resolvePlayback;
        this.resolvePlayback = null;
        context.close().catch(() => undefined);
        finish?.();
      };
      try {
        source.start();
      } catch (error) {
        source.onended = null;
        this.source = null;
        this.context = null;
        this.resolvePlayback = null;
        context.close().catch(() => undefined);
        reject(error);
      }
    });
  }

  public stop(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // 已自然结束的 AudioBufferSourceNode 无需再次停止。
      }
    }
    this.context?.close().catch(() => undefined);
    this.source = null;
    this.context = null;
    const finish = this.resolvePlayback;
    this.resolvePlayback = null;
    finish?.();
  }
}
