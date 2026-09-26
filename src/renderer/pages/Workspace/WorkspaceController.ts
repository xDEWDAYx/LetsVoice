export type WorkspaceItem = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  recent_at: string;
  note_count: number;
  pinned_count: number;
};

export type SubnoteItem = {
  id: number;
  template_name?: string;
  content_type: string;
  content: string;
  created_at: string;
};

export type KnowledgeOutputItem = {
  id: number;
  template_name: string;
  content_type: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type ConversationItem = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  messages: Array<{
    id: number;
    role: string;
    content: string;
    created_at: string;
  }>;
};

export type NoteItem = {
  id: number;
  name: string | null;
  audio_relative_path: string | null;
  transcript: string;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  subnotes: SubnoteItem[];
  knowledge_outputs: KnowledgeOutputItem[];
  conversations: ConversationItem[];
};

export type AudioData = {
  mime_type: string;
  bytes: Uint8Array;
};

type WorkspaceApi = {
  getList(limit?: number): Promise<WorkspaceItem[]>;
  create(name: string): Promise<WorkspaceItem>;
  open(workspaceId: number): Promise<WorkspaceItem>;
  getNotes(workspaceId: number): Promise<NoteItem[]>;
  getNoteAudio(workspaceId: number, noteId: number): Promise<AudioData | null>;
  rename(workspaceId: number, name: string): Promise<boolean>;
  delete(workspaceId: number): Promise<boolean>;
};

/**
 * 渲染进程工作空间控制器：封装 IPC 调用和纯展示逻辑。
 * Renderer workspace controller: wraps IPC calls and view-only transformations.
 *
 * 操作方式 / Usage:
 * WorkspacePage 创建一个实例，然后通过公开方法读取或修改工作空间。
 * WorkspacePage owns one instance and uses its public methods for all operations.
 */
export class WorkspaceController {
  private readonly api: WorkspaceApi;

  public constructor(api: WorkspaceApi = window.electron.workspace) {
    this.api = api;
  }

  public getWorkspaces(limit = 6): Promise<WorkspaceItem[]> {
    return this.api.getList(limit);
  }

  public createWorkspace(name: string): Promise<WorkspaceItem> {
    return this.api.create(name);
  }

  public openWorkspace(workspaceId: number): Promise<WorkspaceItem> {
    return this.api.open(workspaceId);
  }

  public getWorkspaceNotes(workspaceId: number): Promise<NoteItem[]> {
    return this.api.getNotes(workspaceId);
  }

  public getNoteAudio(
    workspaceId: number,
    noteId: number,
  ): Promise<AudioData | null> {
    return this.api.getNoteAudio(workspaceId, noteId);
  }

  public renameWorkspace(workspaceId: number, name: string): Promise<boolean> {
    return this.api.rename(workspaceId, name);
  }

  public deleteWorkspace(workspaceId: number): Promise<boolean> {
    return this.api.delete(workspaceId);
  }

  public static filterNotes(notes: NoteItem[], query: string): NoteItem[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return notes;

    return notes.filter((note) => {
      const relatedContent = [
        note.name ?? '',
        note.transcript,
        ...note.subnotes.map((subnote) => subnote.content),
        ...note.knowledge_outputs.flatMap((output) => [
          output.template_name,
          output.content,
        ]),
        ...note.conversations.flatMap((conversation) => [
          conversation.name,
          ...conversation.messages.map((message) => message.content),
        ]),
      ].join(' ');
      return relatedContent.toLocaleLowerCase().includes(normalizedQuery);
    });
  }

  public static formatDate(
    value: string,
    format: 'long' | 'short',
    language: string = 'zh-CN',
  ): string {
    const options: Intl.DateTimeFormatOptions =
      format === 'long'
        ? { dateStyle: 'long' }
        : { month: 'short', day: 'numeric' };
    return new Intl.DateTimeFormat(language, options).format(new Date(value));
  }

  public static getErrorMessage(reason: unknown, fallback: string): string {
    return reason instanceof Error ? reason.message : fallback;
  }
}
