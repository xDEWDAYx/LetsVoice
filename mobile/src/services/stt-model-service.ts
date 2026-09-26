import { File, Paths } from "expo-file-system";
import { initParakeet, initWhisper } from "whisper.rn/index";

import {
  STT_MODEL_CATALOG,
  STT_MODELS_DIRECTORY_NAME,
  SttModelCatalogEntry,
} from "@/constants/stt-model-catalog";
import { SttModel } from "@/domain/stt-model/stt-model";
import { DatabaseError } from "@/errors/database-error";
import { SttModelNotFoundError } from "@/errors/stt-model-not-found-error";
import { ValidationError } from "@/errors/validation-error";
import { SttModelRepository } from "@/repositories/stt-model-repository";
import { ensureStorageAvailable } from "@/services/storage-safety-service";

export type SttModelDownloadProgress = {
  bytesWritten: number;
  totalBytes: number;
};

export type SttModelDownloadState = {
  progress: SttModelDownloadProgress | null;
};

type ActiveDownload = {
  state: SttModelDownloadState;
  promise: Promise<SttModel>;
  listeners: Set<(progress: SttModelDownloadProgress) => void>;
};

export class SttModelService {
  private readonly activeDownloads = new Map<string, ActiveDownload>();

  public constructor(private readonly sttModelRepository: SttModelRepository) {}

  public getCatalog(): readonly SttModelCatalogEntry[] {
    return STT_MODEL_CATALOG;
  }

  public getCatalogEntry(catalogId: string): SttModelCatalogEntry | null {
    return STT_MODEL_CATALOG.find((entry) => entry.id === catalogId) ?? null;
  }

  public async getInstalledModels(): Promise<SttModel[]> {
    return this.sttModelRepository.findAll();
  }

  public async getActiveModel(): Promise<SttModel | null> {
    return this.sttModelRepository.findActive();
  }

  public getDownloadState(catalogId: string): SttModelDownloadState | null {
    return this.activeDownloads.get(catalogId)?.state ?? null;
  }

  public getDownloadPromise(catalogId: string): Promise<SttModel> | null {
    return this.activeDownloads.get(catalogId)?.promise ?? null;
  }

  public subscribeToDownload(
    catalogId: string,
    listener: (progress: SttModelDownloadProgress) => void,
  ): () => void {
    const activeDownload = this.activeDownloads.get(catalogId);

    if (activeDownload === undefined) {
      return () => undefined;
    }

    activeDownload.listeners.add(listener);
    if (activeDownload.state.progress !== null) {
      listener(activeDownload.state.progress);
    }

    return () => activeDownload.listeners.delete(listener);
  }

  public async downloadModel(
    catalogId: string,
    onProgress?: (progress: SttModelDownloadProgress) => void,
  ): Promise<SttModel> {
    const catalogEntry = this.getCatalogEntryOrThrow(catalogId);
    const existing = await this.sttModelRepository.findById(catalogId);

    if (existing !== null) {
      throw new ValidationError("This model is already installed.");
    }

    const activeDownload = this.activeDownloads.get(catalogId);
    if (activeDownload !== undefined) {
      if (onProgress !== undefined) {
        activeDownload.listeners.add(onProgress);
      }
      return activeDownload.promise;
    }

    ensureStorageAvailable(catalogEntry.sizeBytes, "download this speech model");

    const destinationFile = new File(
      Paths.document,
      STT_MODELS_DIRECTORY_NAME,
      catalogEntry.fileName,
    );
    destinationFile.parentDirectory.create({
      idempotent: true,
      intermediates: true,
    });

    const state: SttModelDownloadState = { progress: null };
    const listeners = new Set<(progress: SttModelDownloadProgress) => void>();
    if (onProgress !== undefined) {
      listeners.add(onProgress);
    }

    const task = File.createDownloadTask(
      catalogEntry.downloadUrl,
      destinationFile,
      {
        sessionType: "foreground",
        onProgress: (data) => {
          state.progress = {
            bytesWritten: data.bytesWritten,
            totalBytes: data.totalBytes,
          };
          listeners.forEach((listener) => listener(state.progress!));
        },
      },
    );

    const promise = this.finishDownload(catalogEntry, destinationFile, task);
    this.activeDownloads.set(catalogId, { state, promise, listeners });

    void promise.then(
      () => this.activeDownloads.delete(catalogId),
      () => this.activeDownloads.delete(catalogId),
    );

    return promise;
  }

  private async finishDownload(
    catalogEntry: SttModelCatalogEntry,
    destinationFile: File,
    task: ReturnType<typeof File.createDownloadTask>,
  ): Promise<SttModel> {
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

    if (
      catalogEntry.expectedSizeBytes !== undefined &&
      downloadedFile.size !== catalogEntry.expectedSizeBytes
    ) {
      this.safelyDeleteFile(downloadedFile);
      throw new DatabaseError(
        "The downloaded model file is incomplete. Please try again.",
      );
    }

    const now = new Date().toISOString();
    const model = new SttModel(
      catalogEntry.id,
      catalogEntry.engine,
      catalogEntry.name,
      catalogEntry.format,
      catalogEntry.quantization,
      `${STT_MODELS_DIRECTORY_NAME}/${catalogEntry.fileName}`,
      downloadedFile.size,
      false,
      now,
      now,
      now,
    );

    try {
      await this.sttModelRepository.create(model);
    } catch (error) {
      this.safelyDeleteFile(downloadedFile);
      throw error;
    }

    return model;
  }

  public async setActiveModel(id: string): Promise<void> {
    const model = await this.getInstalledModelOrThrow(id);
    const file = this.resolveModelFile(model);

    if (!file.exists) {
      throw new ValidationError(
        "The model file is missing on this device. Please download it again.",
      );
    }

    try {
      const context = model.getEngine() === "parakeet"
        ? await initParakeet({ filePath: file.uri, useGpu: true })
        : await initWhisper({
            filePath: file.uri,
            useGpu: true,
            useCoreMLIos: false,
          });
      await context.release();
    } catch {
      throw new ValidationError(
        "This speech recognition model could not be loaded. Download it again.",
      );
    }

    await this.sttModelRepository.deactivateAll();
    model.activate();
    await this.sttModelRepository.update(model);
  }

  public async uninstallModel(id: string): Promise<void> {
    const model = await this.getInstalledModelOrThrow(id);

    if (model.getIsActive()) {
      throw new ValidationError(
        "This model is currently in use and cannot be uninstalled.",
      );
    }

    await this.sttModelRepository.delete(id);
    this.safelyDeleteFile(this.resolveModelFile(model));
  }

  public resolveModelFile(model: SttModel): File {
    return new File(Paths.document, ...model.getFileRelativePath().split("/"));
  }

  private safelyDeleteFile(file: File): void {
    try {
      if (file.exists) {
        file.delete();
      }
    } catch {
      // Ignore cleanup failures; there is nothing else to do here.
    }
  }

  private getCatalogEntryOrThrow(catalogId: string): SttModelCatalogEntry {
    const catalogEntry = this.getCatalogEntry(catalogId);

    if (catalogEntry === null) {
      throw new ValidationError("Unknown speech recognition model.");
    }

    return catalogEntry;
  }

  private async getInstalledModelOrThrow(id: string): Promise<SttModel> {
    const model = await this.sttModelRepository.findById(id);

    if (model === null) {
      throw new SttModelNotFoundError(id);
    }

    return model;
  }
}
