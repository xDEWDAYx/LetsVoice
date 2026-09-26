export type WorkspaceSuggestion = {
  shouldSuggest: boolean;
  category: string;
  name: string;
  reason: string;
  targetWorkspaceId: number | null;
};

export type WorkspaceSignal = {
  id: number;
  name: string;
  note_count: number;
  content: string | null;
};
