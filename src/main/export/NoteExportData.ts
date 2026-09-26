import type {
  ScenarioKnowledge,
  StructuredNote,
} from '@shared/types/KnowledgeGenerationTypes';

export type NoteExportRequest = {
  workspaceId: number;
  noteId: number;
  format: 'word' | 'pdf';
};

export type NoteExportSubnote = {
  id: number;
  contentType: string;
  content: string;
  createdAt: string;
};

export type NoteExportKnowledgeOutput = {
  id: number;
  templateName: string;
  contentType: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteExportTodo = {
  id: number;
  title: string;
  dateString: string;
  isCompleted: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoteExportConversation = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    id: number;
    role: string;
    content: string;
    createdAt: string;
  }>;
};

export type NoteExportData = {
  noteId: number;
  workspaceId: number;
  workspaceName: string;
  title: string;
  transcript: string;
  typeCategory: string | null;
  audioRelativePath: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  structuredNote: StructuredNote | null;
  scenarioKnowledge: ScenarioKnowledge | null;
  subnotes: NoteExportSubnote[];
  knowledgeOutputs: NoteExportKnowledgeOutput[];
  todos: NoteExportTodo[];
  conversations: NoteExportConversation[];
};

export type NoteExportBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | {
      kind: 'paragraph';
      text: string;
      style?: 'body' | 'lead' | 'muted' | 'code';
    }
  | { kind: 'definition'; label: string; value: string }
  | {
      kind: 'listItem';
      text: string;
      ordered?: boolean;
      level?: 0 | 1;
      checked?: boolean;
    }
  | { kind: 'divider' };

export type NoteExportLayout = {
  language: 'zh' | 'en';
  title: string;
  subtitle: string;
  blocks: NoteExportBlock[];
};
