export type SavedRecording = {
  relativePath: string;
  mimeType: string;
  byteLength: number;
  createdAt: string;
};

export type AudioImportProgress = {
  transferredBytes: number;
  totalBytes: number;
  percent: number;
};

export type AudioImportProgressEvent = AudioImportProgress & {
  requestId: string;
};
