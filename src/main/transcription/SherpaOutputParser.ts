import type { TranscriptSegment } from '@shared/types/TranscriptionTypes';

export type SherpaRecognitionResult = {
  text?: string;
  tokens?: unknown[];
  timestamps?: unknown[];
  durations?: unknown[];
};

function joinTokens(tokens: unknown[]): string {
  return tokens
    .map((token) =>
      String(token || '')
        .replaceAll('▁', ' ')
        .trim(),
    )
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.!?;:。！？；：])/g, '$1')
    .trim();
}

/** 把 sherpa token 时间戳按句号或 15 秒窗口整理成统一片段。 */
export default function parseSherpaSegments(
  result: SherpaRecognitionResult,
): TranscriptSegment[] {
  const tokens = Array.isArray(result.tokens) ? result.tokens : [];
  const timestamps = Array.isArray(result.timestamps) ? result.timestamps : [];
  const durations = Array.isArray(result.durations) ? result.durations : [];
  if (tokens.length === 0 || timestamps.length === 0) return [];

  const segments: TranscriptSegment[] = [];
  let startMs: number | null = null;
  let endMs = 0;
  let currentTokens: unknown[] = [];
  const flush = () => {
    if (startMs === null) return;
    const text = joinTokens(currentTokens);
    if (text) {
      segments.push({
        id: `segment-${segments.length + 1}`,
        startMs,
        endMs,
        text,
      });
    }
    startMs = null;
    endMs = 0;
    currentTokens = [];
  };

  tokens.forEach((token, index) => {
    const startSeconds = Number(timestamps[index]);
    if (!Number.isFinite(startSeconds)) return;
    const durationSeconds = Number(durations[index]);
    const nextStartSeconds = Number(timestamps[index + 1]);
    const tokenStartMs = Math.max(0, Math.round(startSeconds * 1000));
    const fallbackDuration = Number.isFinite(nextStartSeconds)
      ? Math.max(0, nextStartSeconds - startSeconds)
      : 0;
    const tokenEndMs = Math.max(
      tokenStartMs,
      Math.round(
        (startSeconds +
          (Number.isFinite(durationSeconds)
            ? durationSeconds
            : fallbackDuration)) *
          1000,
      ),
    );
    if (startMs === null) startMs = tokenStartMs;
    currentTokens.push(token);
    endMs = tokenEndMs;
    if (
      /[.!?。！？]["')\]}]*$/.test(String(token || '').trim()) ||
      endMs - startMs >= 15_000
    ) {
      flush();
    }
  });
  flush();
  return segments;
}
