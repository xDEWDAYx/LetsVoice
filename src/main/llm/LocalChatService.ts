import ollama, { ChatRequest, ChatResponse } from 'ollama';
import { LLMModelManager } from '../AI-module/LLMModelManager';
import {
  normalizeChatFormat,
  normalizeChatMessages,
  normalizeTemperature,
} from './LocalChatInput';

type ChatClient = {
  chat(request: ChatRequest & { stream: false }): Promise<ChatResponse>;
};

type LocalChatDependencies = {
  modelManager?: LLMModelManager;
  client?: ChatClient;
};

export type LocalChatOptions = {
  temperature?: number;
  format?: Record<string, unknown>;
};

export type LocalChatResult = {
  content: string;
  modelName: string;
  runtimeName: 'Ollama';
};

/**
 * 使用模型管理页中已激活的 Ollama 模型生成回复。
 * 操作方法：先启动 Ollama、下载并激活 LLM，再通过 LLM:chat IPC 传入消息数组。
 */
export default class LocalChatService {
  private readonly modelManager: LLMModelManager;

  private readonly client: ChatClient;

  public constructor(dependencies: LocalChatDependencies = {}) {
    this.modelManager = dependencies.modelManager ?? new LLMModelManager();
    this.client = dependencies.client ?? ollama;
  }

  public async chat(
    rawMessages: unknown,
    rawOptions: unknown = {},
  ): Promise<LocalChatResult> {
    const messages = normalizeChatMessages(rawMessages);
    const temperature = normalizeTemperature(rawOptions);
    const format = normalizeChatFormat(rawOptions);
    const activeModel = await this.modelManager.getActivatedModel();

    if (!activeModel) {
      throw new Error(
        '请先启动 Ollama，并下载和激活一个语言模型 / Start Ollama, then download and activate an LLM',
      );
    }

    const response = await this.client.chat({
      model: activeModel.modelName,
      messages,
      stream: false,
      ...(format ? { format } : {}),
      options: { temperature },
    });
    const content = response.message?.content?.trim();

    if (!content) {
      throw new Error('Ollama 返回了空回复 / Ollama returned an empty reply');
    }

    return {
      content,
      modelName: activeModel.modelName,
      runtimeName: 'Ollama',
    };
  }
}
