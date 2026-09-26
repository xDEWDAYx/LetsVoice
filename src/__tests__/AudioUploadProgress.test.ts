import type {
  AudioImportProgress,
  SavedRecording,
} from '@shared/types/AudioTypes';
import type { TranscriptionJob } from '@shared/types/TranscriptionTypes';
import TranscriptionController from '../renderer/pages/Recording/TranscriptionController';

type ProgressListener = (progress: AudioImportProgress) => void;

const selectedFile = 'C:\\recordings\\meeting.wav';
const importedRecording: SavedRecording = {
  relativePath: 'recordings/uploaded-audio.wav',
  mimeType: 'audio/wav',
  byteLength: 1000,
  createdAt: '2026-08-24T10:00:00.000Z',
};
const processingJob: TranscriptionJob = {
  id: 'job-1',
  source: {
    kind: 'recording',
    relativePath: importedRecording.relativePath,
    language: 'en',
  },
  status: 'processing',
  phase: 'preparing',
  statusMessage: 'Preparing',
  errorMessage: null,
  result: null,
  attempt: 1,
  createdAt: '2026-08-24T10:00:00.000Z',
  updatedAt: '2026-08-24T10:00:00.000Z',
};

describe('audio upload progress', () => {
  let emitProgress: ProgressListener;
  let finishImport: (recording: SavedRecording) => void;
  let importRecordingFile: jest.Mock;
  let detectLanguage: jest.Mock;
  let start: jest.Mock;

  beforeEach(() => {
    emitProgress = () => {};
    finishImport = () => {};
    const importPromise = new Promise<SavedRecording>((resolve) => {
      finishImport = resolve;
    });
    importRecordingFile = jest.fn(
      (_filePath: string, onProgress: ProgressListener) => {
        emitProgress = onProgress;
        return importPromise;
      },
    );
    detectLanguage = jest.fn().mockResolvedValue({
      language: 'en',
      confidence: 0.98,
      source: 'whisper',
    });
    start = jest.fn().mockResolvedValue(processingJob);

    (window as any).electron = {
      audio: {
        pickFile: jest.fn().mockResolvedValue(selectedFile),
        importRecordingFile,
        discardRecording: jest.fn().mockResolvedValue({ deleted: true }),
      },
      transcription: {
        onStatus: () => () => {},
        onPartial: () => () => {},
        detectLanguage,
        start,
      },
      knowledge: {
        generateStructuredNoteDraft: jest.fn(),
      },
    };
  });

  it('publishes byte progress, then transcribes the managed copy', async () => {
    const controller = new TranscriptionController();
    const task = controller.pickFileAndStart({ skipConfirmation: true });
    await Promise.resolve();

    expect(importRecordingFile).toHaveBeenCalledWith(
      selectedFile,
      expect.any(Function),
    );
    expect(controller.getSnapshot().uploadPending).toBe(true);

    emitProgress({ transferredBytes: 420, totalBytes: 1000, percent: 42 });
    expect(controller.getSnapshot().uploadProgress).toEqual({
      transferredBytes: 420,
      totalBytes: 1000,
      percent: 42,
    });

    finishImport(importedRecording);
    await task;

    expect(controller.getSnapshot().uploadPending).toBe(false);
    expect(controller.getSnapshot().uploadProgress?.percent).toBe(100);
    expect(controller.getSnapshot().uploadedRecording).toEqual(
      importedRecording,
    );
    expect(detectLanguage).toHaveBeenCalledWith({
      kind: 'recording',
      relativePath: importedRecording.relativePath,
      language: 'auto',
    });
    expect(start).toHaveBeenCalledWith({
      kind: 'recording',
      relativePath: importedRecording.relativePath,
      language: 'en',
    });
  });
});
