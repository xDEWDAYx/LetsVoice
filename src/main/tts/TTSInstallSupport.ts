import { DownloadProgress } from '../runtime/FileDownloadService';

export type TTSInstallProgress = {
  phase: 'checking' | 'downloading' | 'extracting' | 'installing' | 'completed';
  message: string;
  receivedBytes?: number;
  totalBytes?: number | null;
};

export function toTTSDownloadProgress(
  progress: DownloadProgress,
  modelName = 'TTS 模型',
): TTSInstallProgress {
  return {
    phase: 'downloading',
    message: `正在下载 ${modelName}`,
    receivedBytes: progress.receivedBytes,
    totalBytes: progress.totalBytes,
  };
}
