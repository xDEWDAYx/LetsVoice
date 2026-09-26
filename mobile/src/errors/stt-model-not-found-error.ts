export class SttModelNotFoundError extends Error {
  public constructor(sttModelId: string) {
    super(`STT model ${sttModelId} was not found.`);
    this.name = "SttModelNotFoundError";
  }
}
