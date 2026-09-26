import { Ollama, ChatRequest, ChatResponse, Message, Tool } from 'ollama';
import { LLMModelManager } from '../AI-module/LLMModelManager';
import { AgentChatReply } from './AgentTypes';

type AgentChatClient = {
  chat(request: ChatRequest & { stream: false }): Promise<ChatResponse>;
  abort(): void;
};

type AgentChatDependencies = {
  modelManager?: Pick<LLMModelManager, 'getActivatedModel'>;
  createClient?: () => AgentChatClient;
};

/** Agent 使用独立 Ollama 客户端，取消时不会中断 Ask AI 的普通聊天。 */
export default class AgentChatService {
  private readonly modelManager: Pick<LLMModelManager, 'getActivatedModel'>;

  private readonly createClient: () => AgentChatClient;

  public constructor(dependencies: AgentChatDependencies = {}) {
    this.modelManager = dependencies.modelManager ?? new LLMModelManager();
    this.createClient = dependencies.createClient ?? (() => new Ollama());
  }

  public async chat(
    messages: Message[],
    tools: Tool[],
    signal?: AbortSignal,
  ): Promise<AgentChatReply> {
    const activeModel = await this.modelManager.getActivatedModel();
    if (!activeModel) {
      throw new Error(
        '请先下载并激活语言模型 / Download and activate an LLM first',
      );
    }

    const client = this.createClient();
    const cancel = () => {
      try {
        client.abort();
      } catch {
        // 客户端已自行结束时，重复取消无需再向上抛错。
      }
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (signal?.aborted) throw AgentChatService.cancelledError();
      const response = await client.chat({
        model: activeModel.modelName,
        messages,
        tools,
        stream: false,
        think: false,
        options: { temperature: 0.1 },
      });
      if (signal?.aborted) throw AgentChatService.cancelledError();
      return { message: response.message, modelName: activeModel.modelName };
    } catch (error) {
      if (signal?.aborted) throw AgentChatService.cancelledError();
      throw error;
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  }

  private static cancelledError(): Error {
    return new Error('Agent 已取消 / Agent run cancelled');
  }
}
