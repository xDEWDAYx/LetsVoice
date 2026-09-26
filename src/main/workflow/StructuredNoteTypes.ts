export type KnowledgeOutputDTO = {
  id: number;
  noteId: number;
  templateId: number;
  contentType: 'text/markdown';
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type StructuredNoteResult = {
  output: KnowledgeOutputDTO;
  modelName: string;
  runtimeName: 'Ollama';
  llmDurationMs: number;
};
