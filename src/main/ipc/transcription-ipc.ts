import { BrowserWindow, ipcMain } from 'electron';
import TranscriptionJobManager from '../transcription/TranscriptionJobManager';
import LocalTranscriptionService from '../transcription/LocalTranscriptionService';
import LiveTranscriptionService from '../transcription/LiveTranscriptionService';

const transcriptionService = new LocalTranscriptionService();
const transcriptionJobManager = new TranscriptionJobManager(
  transcriptionService,
);
const liveTranscriptionService = new LiveTranscriptionService(
  transcriptionService,
);

transcriptionJobManager.subscribe((job) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('Transcription:status', job);
  });
});

transcriptionJobManager.subscribePartial((jobId, segment) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('Transcription:partial', { jobId, segment });
  });
});

ipcMain.handle('Transcription:run', (_event, source: unknown) =>
  transcriptionService.transcribe(source),
);
ipcMain.handle('Transcription:detectLanguage', (_event, source: unknown) =>
  transcriptionService.detectLanguage(source),
);
ipcMain.handle(
  'Transcription:liveRun',
  (_event, data: unknown, mimeType: unknown) =>
    liveTranscriptionService.transcribe(data, mimeType),
);
ipcMain.handle('Transcription:start', (_event, source: unknown) =>
  transcriptionJobManager.start(source),
);
ipcMain.handle('Transcription:get', (_event, jobId: unknown) =>
  transcriptionJobManager.get(jobId),
);
ipcMain.handle('Transcription:cancel', (_event, jobId: unknown) =>
  transcriptionJobManager.cancel(jobId),
);
ipcMain.handle('Transcription:retry', (_event, jobId: unknown) =>
  transcriptionJobManager.retry(jobId),
);
