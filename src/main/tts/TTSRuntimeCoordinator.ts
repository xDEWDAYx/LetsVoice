import TTSRuntimeService from './TTSRuntimeService';
import TTSService from './TTSService';

/** IPC 之间共用唯一 TTS 引擎缓存，模型切换时可立即释放。 */
export const ttsRuntimeService = new TTSRuntimeService();
export const ttsService = new TTSService(ttsRuntimeService);
