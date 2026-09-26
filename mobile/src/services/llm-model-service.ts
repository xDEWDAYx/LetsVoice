import { File, Paths } from "expo-file-system";
import { loadLlamaModelInfo } from "llama.rn";

import {
  LLM_MODEL_CATALOG,
  LLM_MODELS_DIRECTORY_NAME,
  LlmModelCatalogEntry,
} from "@/constants/llm-model-catalog";
import { LlmModel } from "@/domain/llm-model/llm-model";
import { DatabaseError } from "@/errors/database-error";
import { LlmModelNotFoundError } from "@/errors/llm-model-not-found-error";
import { ValidationError } from "@/errors/validation-error";
import { LlmModelRepository } from "@/repositories/llm-model-repository";
import { LocalLlmCoordinator } from "@/services/local-llm-coordinator";
import { ensureStorageAvailable } from "@/services/storage-safety-service";

export type LlmModelDownloadProgress = {
  bytesWritten: number;
  totalBytes: number;
};

export type LlmModelDownloadState = {
  progress: LlmModelDownloadProgress | null;
};

type ActiveDownload = {
  state: LlmModelDownloadState;
  promise: Promise<LlmModel>;
  listeners: Set<(progress: LlmModelDownloadProgress) => void>;
};

export class LlmModelService {
  private readonly activeDownloads = new Map<string, ActiveDownload>();

  public constructor(private readonly llmModelRepository: LlmModelRepository, private readonly coordinator: LocalLlmCoordinator) {}

  public getCatalog(): readonly LlmModelCatalogEntry[] { return LLM_MODEL_CATALOG; }
  public getInstalledModels(): Promise<LlmModel[]> { return this.llmModelRepository.findAll(); }
  public getActiveModel(): Promise<LlmModel | null> { return this.llmModelRepository.findActive(); }

  public getDownloadState(catalogId: string): LlmModelDownloadState | null {
    return this.activeDownloads.get(catalogId)?.state ?? null;
  }

  public getDownloadPromise(catalogId: string): Promise<LlmModel> | null {
    return this.activeDownloads.get(catalogId)?.promise ?? null;
  }

  public subscribeToDownload(
    catalogId: string,
    listener: (progress: LlmModelDownloadProgress) => void,
  ): () => void {
    const download = this.activeDownloads.get(catalogId);
    if (download === undefined) return () => undefined;
    download.listeners.add(listener);
    if (download.state.progress !== null) listener(download.state.progress);
    return () => download.listeners.delete(listener);
  }

  public async downloadModel(
    catalogId: string,
    onProgress?: (progress: LlmModelDownloadProgress) => void,
  ): Promise<LlmModel> {
    const catalogEntry = this.getCatalogEntryOrThrow(catalogId);
    if (await this.llmModelRepository.findById(catalogId)) {
      throw new ValidationError("This model is already installed.");
    }

    const activeDownload = this.activeDownloads.get(catalogId);
    if (activeDownload !== undefined) {
      if (onProgress !== undefined) activeDownload.listeners.add(onProgress);
      return activeDownload.promise;
    }

    ensureStorageAvailable(catalogEntry.sizeBytes, "download this language model");

    const destinationFile = new File(
      Paths.document,
      LLM_MODELS_DIRECTORY_NAME,
      catalogEntry.fileName,
    );
    destinationFile.parentDirectory.create({ idempotent: true, intermediates: true });

    const state: LlmModelDownloadState = { progress: null };
    const listeners = new Set<(progress: LlmModelDownloadProgress) => void>();
    if (onProgress !== undefined) listeners.add(onProgress);
    const task = File.createDownloadTask(catalogEntry.downloadUrl, destinationFile, {
      sessionType: "foreground",
      onProgress: (data) => {
        state.progress = {
          bytesWritten: data.bytesWritten,
          totalBytes: data.totalBytes,
        };
        listeners.forEach((listener) => listener(state.progress!));
      },
    });

    const promise = this.finishDownload(catalogEntry, destinationFile, task);
    this.activeDownloads.set(catalogId, { state, promise, listeners });
    void promise.then(
      () => this.activeDownloads.delete(catalogId),
      () => this.activeDownloads.delete(catalogId),
    );
    return promise;
  }

  public async setActiveModel(id: string): Promise<void> {
    return this.coordinator.runExclusive("model-management", () => this.setActiveModelExclusive(id));
  }

  private async setActiveModelExclusive(id: string): Promise<void> {
    const model = await this.getInstalledModelOrThrow(id);
    const file = this.resolveModelFile(model);
    if (!file.exists) {
      throw new ValidationError(
        "The model file is missing on this device. Please download it again.",
      );
    }

    try {
      await loadLlamaModelInfo(file.uri);
    } catch {
      throw new ValidationError("This GGUF file cannot be loaded by llama.rn.");
    }

    model.activate();
    await this.llmModelRepository.activateExclusively(model);
  }

  public async uninstallModel(id: string): Promise<void> {
    return this.coordinator.runExclusive("model-management", () => this.uninstallModelExclusive(id));
  }

  private async uninstallModelExclusive(id: string): Promise<void> {
    const model = await this.getInstalledModelOrThrow(id);
    if (model.getIsActive()) {
      throw new ValidationError(
        "This model is currently in use and cannot be uninstalled.",
      );
    }
    await this.llmModelRepository.delete(id);
    this.safelyDeleteFile(this.resolveModelFile(model));
  }

  public resolveModelFile(model: LlmModel): File {
    return new File(Paths.document, ...model.getFileRelativePath().split("/"));
  }

  private async finishDownload(
    entry: LlmModelCatalogEntry,
    destinationFile: File,
    task: ReturnType<typeof File.createDownloadTask>,
  ): Promise<LlmModel> {
    let downloadedFile: File | null;
    try {
      downloadedFile = await task.downloadAsync();
    } catch (error) {
      this.safelyDeleteFile(destinationFile);
      throw new DatabaseError("Unable to download the model.", {
        cause: error instanceof Error ? error : undefined,
      });
    }
    if (downloadedFile === null || !downloadedFile.exists) {
      this.safelyDeleteFile(destinationFile);
      throw new DatabaseError("Model download did not complete.");
    }

    const now = new Date().toISOString();
    const model = new LlmModel(
      entry.id, entry.engine, entry.name, entry.format, entry.quantization,
      `${LLM_MODELS_DIRECTORY_NAME}/${entry.fileName}`, downloadedFile.size,
      false, now, now, now,
    );
    try {
      await this.llmModelRepository.create(model);
    } catch (error) {
      this.safelyDeleteFile(downloadedFile);
      throw error;
    }
    return model;
  }

  private safelyDeleteFile(file: File): void {
    try { if (file.exists) file.delete(); } catch { /* Best-effort cleanup. */ }
  }

  private getCatalogEntryOrThrow(id: string): LlmModelCatalogEntry {
    const entry = LLM_MODEL_CATALOG.find((item) => item.id === id);
    if (entry === undefined) throw new ValidationError("Unknown language model.");
    return entry;
  }

  private async getInstalledModelOrThrow(id: string): Promise<LlmModel> {
    const model = await this.llmModelRepository.findById(id);
    if (model === null) throw new LlmModelNotFoundError(id);
    return model;
  }
}
