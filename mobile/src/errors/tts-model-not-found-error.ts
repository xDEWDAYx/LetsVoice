export class TtsModelNotFoundError extends Error {
  public constructor(id: string) {
    super(`TTS model not found: ${id}`);
    this.name = "TtsModelNotFoundError";
  }
}
