import type { TTSSpeaker } from '@shared/types/TTSRuntimeTypes';

const SPEAKER_KEY = 'speakspace:tts:speaker-by-model';

function readPreferences(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SPEAKER_KEY) ?? '{}') as {
      [modelId: string]: unknown;
    };
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

/** 每个模型单独记住音色；已失效的音色自动回到该模型默认值。 */
export function getPreferredSpeakerId(
  modelId: string,
  speakers: TTSSpeaker[],
): string {
  const storedId = readPreferences()[modelId];
  const selected = speakers.find((speaker) => speaker.id === storedId);
  return (
    selected?.id ??
    speakers.find((speaker) => speaker.isDefault)?.id ??
    speakers[0]?.id ??
    ''
  );
}

export function setPreferredSpeakerId(
  modelId: string,
  speakerId: string,
): void {
  localStorage.setItem(
    SPEAKER_KEY,
    JSON.stringify({ ...readPreferences(), [modelId]: speakerId }),
  );
}
