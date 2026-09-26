import { app, ipcMain } from 'electron';
import { ttsRuntimeService, ttsService } from '../tts/TTSRuntimeCoordinator';

ipcMain.handle('TTS:getStatus', () => ttsRuntimeService.getStatus());

// 只接受文字、音色 id 和语速；模型路径与原生模块不会暴露给 Renderer。
ipcMain.handle('TTS:synthesize', (_event, text: unknown, options: unknown) =>
  ttsService.synthesize(text, options),
);

app.on('before-quit', () => ttsService.dispose());
