import { app, ipcMain } from 'electron';
import LocalChatService from '../llm/LocalChatService';
import ollamaServerController from '../llm/OllamaRuntime';

const localChatService = new LocalChatService();

// Renderer 只提交消息；主进程按需启动服务，再使用已激活模型。
ipcMain.handle(
  'LLM:chat',
  async (_event, messages: unknown, options: unknown) => {
    await ollamaServerController.ensureRunning();
    return localChatService.chat(messages, options);
  },
);

app.on('before-quit', () => ollamaServerController.stop());
