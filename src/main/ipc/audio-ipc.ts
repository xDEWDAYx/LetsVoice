import { dialog, ipcMain } from 'electron';
import type { AudioImportProgressEvent } from '@shared/types/AudioTypes';
import AudioDurationService from '../audio/AudioDurationService';
import RecordingStorageService from '../audio/RecordingStorageService';

const recordingStorageService = new RecordingStorageService();

ipcMain.handle('Audio:pickFile', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择音频或视频文件 / Select audio or video file',
    properties: ['openFile'],
    filters: [
      {
        name: 'Audio / Video',
        extensions: ['wav', 'mp3', 'm4a', 'mp4', 'flac', 'aac', 'ogg', 'webm'],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle('Audio:getDuration', (_event, filePath: unknown) =>
  AudioDurationService.getMediaDurationMs(filePath),
);

ipcMain.handle(
  'Audio:saveRecording',
  (_event, data: unknown, mimeType: unknown) =>
    recordingStorageService.saveRecording(data, mimeType),
);

ipcMain.handle(
  'Audio:importRecordingFile',
  (event, filePath: unknown, rawRequestId: unknown) => {
    const requestId =
      typeof rawRequestId === 'string' && rawRequestId.length <= 128
        ? rawRequestId
        : null;
    return recordingStorageService.importRecordingFile(
      filePath,
      requestId
        ? (progress) => {
            if (event.sender.isDestroyed()) return;
            const payload: AudioImportProgressEvent = {
              requestId,
              ...progress,
            };
            event.sender.send('Audio:importProgress', payload);
          }
        : undefined,
    );
  },
);

ipcMain.handle('Audio:discardRecording', (_event, relativePath: unknown) =>
  recordingStorageService.discardRecording(relativePath),
);
