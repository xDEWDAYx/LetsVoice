import type { TTSAudioResult } from '@shared/types/TTSRuntimeTypes';
import { playTTSChunks, splitTTSChunks } from './TTSPlaybackPipeline';

const audio = (id: string): TTSAudioResult => ({
  source: 'local',
  backend: 'sherpa-kokoro',
  modelId: id,
  modelName: id,
  speakerId: '0',
  speakerName: 'speaker',
  sampleRate: 24_000,
  channelCount: 1,
  channelData: [Float32Array.of(0.1)],
});

describe('splitTTSChunks', () => {
  it('优先在自然句末切分并限制片段长度', () => {
    const text =
      '第一句先交代背景和目的，并在适合朗读的位置自然结束。第二句继续补充更多具体信息，确保整段文字足够长并需要切分。第三句说明最后的结论和下一步安排。';
    const chunks = splitTTSChunks(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 40)).toBe(true);
    expect(chunks.join('')).toBe(text);
  });

  it('没有标点的长文本也不会丢字', () => {
    const text = '语'.repeat(150);
    const chunks = splitTTSChunks(text);

    expect(chunks.map((chunk) => chunk.length)).toEqual([40, 40, 40, 30]);
    expect(chunks.join('')).toBe(text);
  });
});

describe('playTTSChunks', () => {
  it('播放当前片段时已经开始合成下一片', async () => {
    const events: string[] = [];
    let finishFirstPlayback!: () => void;
    const firstPlayback = new Promise<void>((resolve) => {
      finishFirstPlayback = resolve;
    });

    const running = playTTSChunks(['一', '二'], {
      synthesize: async (text) => {
        events.push(`synthesize:${text}`);
        return audio(text);
      },
      play: async (result) => {
        events.push(`play:${result.modelId}`);
        if (result.modelId === '一') await firstPlayback;
      },
      isCancelled: () => false,
      onFirstAudioReady: () => events.push('ready'),
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual([
      'synthesize:一',
      'synthesize:二',
      'ready',
      'play:一',
    ]);

    finishFirstPlayback();
    await running;
    expect(events.at(-1)).toBe('play:二');
  });
});
