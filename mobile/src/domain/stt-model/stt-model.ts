export type SttModelEngine = "parakeet" | "whisper";

export class SttModel {
  private readonly id: string;
  private readonly engine: SttModelEngine;
  private readonly name: string;
  private readonly format: string;
  private readonly quantization: string | null;
  private readonly fileRelativePath: string;
  private readonly sizeBytes: number;
  private isActive: boolean;
  private readonly downloadedAt: string;
  private readonly createdAt: string;
  private updatedAt: string;

  public constructor(
    id: string,
    engine: SttModelEngine,
    name: string,
    format: string,
    quantization: string | null,
    fileRelativePath: string,
    sizeBytes: number,
    isActive: boolean,
    downloadedAt: string,
    createdAt: string,
    updatedAt: string,
  ) {
    this.id = id;
    this.engine = engine;
    this.name = name;
    this.format = format;
    this.quantization = quantization;
    this.fileRelativePath = fileRelativePath;
    this.sizeBytes = sizeBytes;
    this.isActive = isActive;
    this.downloadedAt = downloadedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  public getId(): string {
    return this.id;
  }

  public getEngine(): SttModelEngine {
    return this.engine;
  }

  public getName(): string {
    return this.name;
  }

  public getFormat(): string {
    return this.format;
  }

  public getQuantization(): string | null {
    return this.quantization;
  }

  public getFileRelativePath(): string {
    return this.fileRelativePath;
  }

  public getSizeBytes(): number {
    return this.sizeBytes;
  }

  public getIsActive(): boolean {
    return this.isActive;
  }

  public getDownloadedAt(): string {
    return this.downloadedAt;
  }

  public getCreatedAt(): string {
    return this.createdAt;
  }

  public getUpdatedAt(): string {
    return this.updatedAt;
  }

  public activate(): void {
    this.isActive = true;
    this.updatedAt = new Date().toISOString();
  }

  public deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date().toISOString();
  }
}
