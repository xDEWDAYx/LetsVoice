export type LlmModelEngine = "llama.rn";

export class LlmModel {
  public constructor(
    private readonly id: string,
    private readonly engine: LlmModelEngine,
    private readonly name: string,
    private readonly format: string,
    private readonly quantization: string | null,
    private readonly fileRelativePath: string,
    private readonly sizeBytes: number,
    private isActive: boolean,
    private readonly downloadedAt: string,
    private readonly createdAt: string,
    private updatedAt: string,
  ) {}

  public getId(): string { return this.id; }
  public getEngine(): LlmModelEngine { return this.engine; }
  public getName(): string { return this.name; }
  public getFormat(): string { return this.format; }
  public getQuantization(): string | null { return this.quantization; }
  public getFileRelativePath(): string { return this.fileRelativePath; }
  public getSizeBytes(): number { return this.sizeBytes; }
  public getIsActive(): boolean { return this.isActive; }
  public getDownloadedAt(): string { return this.downloadedAt; }
  public getCreatedAt(): string { return this.createdAt; }
  public getUpdatedAt(): string { return this.updatedAt; }

  public activate(): void {
    this.isActive = true;
    this.updatedAt = new Date().toISOString();
  }

  public deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date().toISOString();
  }
}
