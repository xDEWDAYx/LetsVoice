import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AudioImportProgress } from '@shared/types/AudioTypes';
import RecordingStorageService from '../RecordingStorageService';

describe('RecordingStorageService audio import', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'speakspace-audio-import-'),
    );
  });

  afterEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  it('streams a selected file into managed storage and reports real progress', async () => {
    const sourcePath = path.join(testRoot, 'meeting.wav');
    const sourceBytes = Buffer.alloc(384 * 1024, 7);
    fs.writeFileSync(sourcePath, sourceBytes);

    const blobRoot = path.join(testRoot, 'blobs');
    const blobStorage = {
      resolveAbsolutePath(relativePath: string) {
        return path.join(blobRoot, ...relativePath.split('/'));
      },
    };
    const database = {};
    const service = new RecordingStorageService(
      blobStorage as never,
      database as never,
    );
    const progress: AudioImportProgress[] = [];

    const result = await service.importRecordingFile(sourcePath, (update) => {
      progress.push(update);
    });

    expect(progress[0]).toEqual({
      transferredBytes: 0,
      totalBytes: sourceBytes.byteLength,
      percent: 0,
    });
    expect(progress.at(-1)).toEqual({
      transferredBytes: sourceBytes.byteLength,
      totalBytes: sourceBytes.byteLength,
      percent: 100,
    });
    expect(progress.length).toBeGreaterThan(2);
    expect(
      fs.readFileSync(blobStorage.resolveAbsolutePath(result.relativePath)),
    ).toEqual(sourceBytes);
    expect(result.byteLength).toBe(sourceBytes.byteLength);
    expect(result.mimeType).toBe('audio/wav');
  });

  it('imports an m4a file from a Windows-style Unicode folder name', async () => {
    const sourcePath = path.join(testRoot, '錄音', '錄製.m4a');
    const sourceBytes = Buffer.alloc(32 * 1024, 9);
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, sourceBytes);

    const blobRoot = path.join(testRoot, 'blobs');
    const blobStorage = {
      resolveAbsolutePath(relativePath: string) {
        return path.join(blobRoot, ...relativePath.split('/'));
      },
    };
    const service = new RecordingStorageService(
      blobStorage as never,
      {} as never,
    );

    const result = await service.importRecordingFile(sourcePath);

    expect(result.mimeType).toBe('audio/mp4');
    expect(result.byteLength).toBe(sourceBytes.byteLength);
    expect(
      fs.readFileSync(blobStorage.resolveAbsolutePath(result.relativePath)),
    ).toEqual(sourceBytes);
  });
});
