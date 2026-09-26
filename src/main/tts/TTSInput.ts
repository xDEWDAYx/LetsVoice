import type { TTSSpeaker } from '@shared/types/TTSRuntimeTypes';

const MAX_TTS_CHARACTERS = 4_000;

export type NormalizedTTSInput = {
  text: string;
  speakerId: string;
  speed: number;
};

/** Renderer 输入先限长、限当前模型音色和限速，再进入本地合成引擎。 */
export function normalizeTTSInput(
  rawText: unknown,
  rawOptions: unknown,
  speakers: TTSSpeaker[],
): NormalizedTTSInput {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!text) throw new Error('待播报文字不能为空 / TTS text is required');
  if (text.length > MAX_TTS_CHARACTERS) {
    throw new Error(`待播报文字不能超过 ${MAX_TTS_CHARACTERS} 个字符`);
  }

  const options =
    typeof rawOptions === 'object' && rawOptions !== null ? rawOptions : {};
  const requestedSpeakerId =
    'speakerId' in options &&
    (typeof options.speakerId === 'string' ||
      typeof options.speakerId === 'number')
      ? String(options.speakerId)
      : null;
  const defaultSpeaker =
    speakers.find((speaker) => speaker.isDefault) ?? speakers[0];
  const speakerId = requestedSpeakerId ?? defaultSpeaker?.id;
  if (!speakerId || !speakers.some((speaker) => speaker.id === speakerId)) {
    throw new Error('无效的 TTS 音色 / Invalid TTS speaker');
  }

  const candidateSpeed = 'speed' in options ? Number(options.speed) : 1;
  const speed = Number.isFinite(candidateSpeed)
    ? Math.min(2, Math.max(0.5, candidateSpeed))
    : 1;
  return { text, speakerId, speed };
}
