/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from 'fs/promises';
import path from 'path';
import { ManagedPaths } from '../runtime/ManagedPaths';
import RecordingStorageService from '../audio/RecordingStorageService';

export class GarbageCollectionService {
  private readonly managedPaths: ManagedPaths;

  private readonly recordingStorage: RecordingStorageService;

  public constructor() {
    this.managedPaths = ManagedPaths.getInstance();
    this.recordingStorage = new RecordingStorageService();
  }

  public async runGarbageCollection(): Promise<void> {
    try {
      this.recordingStorage.cleanupOrphanedRecordings();
      await this.cleanupTempDownloads();
      await this.cleanupRuntimeOutputsAndCaches();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Garbage collection failed:', err);
    }
  }

  private async cleanupTempDownloads(): Promise<void> {
    const root = this.managedPaths.getDataRoot();
    const oneHourAgoMs = Date.now() - 60 * 60 * 1000;

    const walkAndDelete = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (_err) {
        return;
      }

      await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walkAndDelete(fullPath);
          } else if (entry.name.endsWith('.download')) {
            try {
              const stat = await fs.stat(fullPath);
              if (stat.mtimeMs < oneHourAgoMs) {
                await fs.unlink(fullPath);
              }
            } catch (_err2) {
              // Ignore
            }
          }
        }),
      );
    };

    await Promise.all([
      walkAndDelete(path.join(root, 'models')),
      walkAndDelete(path.join(root, 'runtimes')),
    ]);
  }

  private async cleanupRuntimeOutputsAndCaches(): Promise<void> {
    const oneHourAgoMs = Date.now() - 60 * 60 * 1000;

    const deleteOldFilesInDir = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (_err) {
        return;
      }

      await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile()) {
            try {
              const stat = await fs.stat(fullPath);
              if (stat.mtimeMs < oneHourAgoMs) {
                await fs.unlink(fullPath);
              }
            } catch (_err2) {
              // Ignore
            }
          }
        }),
      );
    };

    const kinds = ['stt', 'tts', 'llm'] as const;
    await Promise.all(
      kinds.map(async (kind) => {
        const paths = this.managedPaths.getRuntimePaths(kind);
        await Promise.all([
          deleteOldFilesInDir(paths.outputRoot),
          deleteOldFilesInDir(paths.cacheRoot),
        ]);
      }),
    );
  }
}
