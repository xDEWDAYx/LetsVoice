export type ManagedModelType = 'stt' | 'tts' | 'llm';

/** 主进程发送给 Renderer 的单模型下载进度。 */
export type ModelDownloadProgressEvent = {
  modelType: ManagedModelType;
  modelId: string;
  message: string;
  receivedBytes: number;
  totalBytes: number | null;
};
