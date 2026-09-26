import type { TTSAudioResult } from '@shared/types/TTSRuntimeTypes';

const MAX_CHUNK_CHARACTERS = 40;
const MIN_CHUNK_CHARACTERS = 24;
const STRONG_BOUNDARIES = new Set('。！？!?；;'.split(''));
const SOFT_BOUNDARIES = new Set('，、,:： '.split(''));

/** 把长回答切成自然短句，避免 TTS 长文本推理时间非线性增长。 */
export function splitTTSChunks(value: string): string[] {
  let remaining = value.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];

  while (remaining) {
    if (remaining.length <= MAX_CHUNK_CHARACTERS) {
      chunks.push(remaining);
      break;
    }

    let cut = 0;
    for (
      let index = MIN_CHUNK_CHARACTERS - 1;
      index < MAX_CHUNK_CHARACTERS;
      index += 1
    ) {
      if (STRONG_BOUNDARIES.has(remaining[index])) {
        cut = index + 1;
        break;
      }
    }
    if (cut === 0) {
      for (
        let index = MAX_CHUNK_CHARACTERS - 1;
        index >= MIN_CHUNK_CHARACTERS;
        index -= 1
      ) {
        if (SOFT_BOUNDARIES.has(remaining[index])) {
          cut = index + 1;
          break;
        }
      }
    }
    if (cut === 0) cut = MAX_CHUNK_CHARACTERS;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  return chunks.filter(Boolean);
}

type SettledAudio =
  | { ok: true; audio: TTSAudioResult }
  | { ok: false; error: unknown };

const settle = async (
  promise: Promise<TTSAudioResult>,
): Promise<SettledAudio> => {
  try {
    return { ok: true, audio: await promise };
  } catch (error) {
    return { ok: false, error };
  }
};

export type TTSPlaybackPipeline = {
  synthesize(text: string): Promise<TTSAudioResult>;
  play(audio: TTSAudioResult): Promise<void>;
  isCancelled(): boolean;
  onFirstAudioReady(): void;
};

/** 播放当前片段时预生成下一片，尽量把推理等待藏在音频播放时间里。 */
export async function playTTSChunks(
  chunks: string[],
  pipeline: TTSPlaybackPipeline,
): Promise<void> {
  if (chunks.length === 0) return;
  let pending = settle(pipeline.synthesize(chunks[0]));

  for (let index = 0; index < chunks.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await pending;
    if (!result.ok) throw result.error;
    if (pipeline.isCancelled()) return;

    const next =
      index + 1 < chunks.length
        ? settle(pipeline.synthesize(chunks[index + 1]))
        : null;
    if (index === 0) pipeline.onFirstAudioReady();
    // eslint-disable-next-line no-await-in-loop
    await pipeline.play(result.audio);
    if (pipeline.isCancelled()) return;
    if (next) pending = next;
  }
}
