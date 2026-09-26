export type EmbeddingModelStatus = {
  runtimeName: 'Ollama';
  modelName: string;
  serverAvailable: boolean;
  installed: boolean;
};

export type EmbeddingInstallProgress = {
  status: string;
  completed: number;
  total: number;
};

export type SemanticNoteResult = {
  id: number;
  workspaceId: number | null;
  name: string;
  transcriptPreview: string;
  score: number;
};
