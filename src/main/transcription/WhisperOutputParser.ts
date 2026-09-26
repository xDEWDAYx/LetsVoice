import type { TranscriptSegment } from '@shared/types/TranscriptionTypes';

type WhisperJsonSegment = {
  text?: unknown;
  offsets?: { from?: unknown; to?: unknown };
};

/** 将 whisper-cli JSON 输出转换为稳定的 Renderer 片段结构。 */
export default class WhisperOutputParser {
  public static parse(payload: unknown): TranscriptSegment[] {
    if (typeof payload !== 'object' || payload === null) return [];
    const { transcription } = payload as { transcription?: unknown };
    if (!Array.isArray(transcription)) return [];

    return transcription
      .map((rawSegment, index) =>
        WhisperOutputParser.parseSegment(rawSegment, index),
      )
      .filter((segment): segment is TranscriptSegment => segment !== null);
  }

  private static parseSegment(
    rawSegment: unknown,
    index: number,
  ): TranscriptSegment | null {
    if (typeof rawSegment !== 'object' || rawSegment === null) return null;
    const segment = rawSegment as WhisperJsonSegment;
    const text = typeof segment.text === 'string' ? segment.text.trim() : '';
    if (!text) return null;

    const startMs = Number(segment.offsets?.from);
    const endMs = Number(segment.offsets?.to);
    return {
      id: `segment-${index + 1}`,
      startMs: Number.isFinite(startMs) && startMs >= 0 ? startMs : 0,
      endMs: Number.isFinite(endMs) && endMs >= 0 ? endMs : null,
      text,
    };
  }
}
