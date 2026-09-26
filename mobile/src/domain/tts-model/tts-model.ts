export type TtsModelEngine = "sherpa-onnx";

export class TtsModel {
  public constructor(
    private readonly id: string,
    private readonly engine: TtsModelEngine,
    private readonly name: string,
    private readonly modelType: string,
    private readonly languages: string,
    private readonly filePath: string,
    private readonly sizeBytes: number,
    private isActive: boolean,
    private readonly downloadedAt: string,
    private readonly createdAt: string,
    private updatedAt: string,
  ) {}

  public getId(): string { return this.id; }
  public getEngine(): TtsModelEngine { return this.engine; }
  public getName(): string { return this.name; }
  public getModelType(): string { return this.modelType; }
  public getLanguages(): string { return this.languages; }
  public getFilePath(): string { return this.filePath; }
  public getSizeBytes(): number { return this.sizeBytes; }
  public getIsActive(): boolean { return this.isActive; }
  public getDownloadedAt(): string { return this.downloadedAt; }
  public getCreatedAt(): string { return this.createdAt; }
  public getUpdatedAt(): string { return this.updatedAt; }

  public activate(): void {
    this.isActive = true;
    this.updatedAt = new Date().toISOString();
  }
}
