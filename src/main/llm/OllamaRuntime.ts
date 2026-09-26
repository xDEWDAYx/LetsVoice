import OllamaServerController from './OllamaServerController';

/** 模型管理和聊天共享同一个启动锁，避免并发创建两个 Ollama 服务。 */
const ollamaServerController = new OllamaServerController();

export default ollamaServerController;
