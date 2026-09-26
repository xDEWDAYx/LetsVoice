export const PARAKEET_ENGINE = 'sherpa-onnx';

export type STTCatalogItem = {
  id: string;
  name: string;
  language: string;
  engine: string;
  format: string;
  size: string;
  downloadUrl: string;
  checksum: string | null;
  modelType?: string;
};
