import { Note } from '@shared/entities/Note';
import { Workspace } from '@shared/entities/Workspace';
import { NoteRepository } from '../database/repositories/NoteRepository';
import { WorkspaceRepository } from '../database/repositories/WorkspaceRepository';
import { AskAIScope, CreateAskAINoteRequest } from './AskAITypes';

const MAX_WORKSPACE_NOTES = 24;

type NoteServiceDependencies = {
  noteRepository?: NoteRepository;
  workspaceRepository?: WorkspaceRepository;
};

/** 负责 Ask AI 的笔记创建和范围选择，不包含聊天调用。 */
export default class AskAINoteService {
  private readonly noteRepository: NoteRepository;

  private readonly workspaceRepository: WorkspaceRepository;

  public constructor(dependencies: NoteServiceDependencies = {}) {
    this.noteRepository = dependencies.noteRepository ?? new NoteRepository();
    this.workspaceRepository =
      dependencies.workspaceRepository ?? new WorkspaceRepository();
  }

  public list(workspaceId: number | null = null): Note[] {
    return workspaceId === null
      ? this.noteRepository.findAll()
      : this.noteRepository.findAllByWorkspace(workspaceId);
  }

  public create(request: CreateAskAINoteRequest): Note {
    const transcript = String(request.transcript || '').trim();
    if (!transcript) {
      throw new Error('笔记内容不能为空 / Note text is required');
    }

    const now = new Date();
    const workspaceId = this.resolveWorkspaceId(request.workspaceId ?? null);
    const name =
      request.name?.trim() || AskAINoteService.defaultName(transcript);
    const note = new Note(
      0,
      workspaceId,
      name,
      null,
      transcript,
      false,
      null,
      now,
      now,
    );
    const noteId = this.noteRepository.create(note);
    const created = this.noteRepository.findById(noteId);

    if (!created) {
      throw new Error('创建后的笔记无法读取 / Saved note not found');
    }
    return created;
  }

  public getSources(
    scope: AskAIScope,
    workspaceId: number | null,
    noteId: number | null,
    noteIds: number[] | null = null,
  ): Note[] {
    if (scope === 'multi-note' && noteIds) {
      return noteIds
        .map((id) => this.noteRepository.findById(id))
        .filter((note): note is Note => note !== null);
    }

    if (scope === 'note') {
      const note =
        noteId === null ? null : this.noteRepository.findById(noteId);
      return note ? [note] : [];
    }

    const resolvedWorkspaceId = workspaceId ?? this.getNoteWorkspaceId(noteId);
    return resolvedWorkspaceId === null
      ? []
      : this.noteRepository
          .findAllByWorkspace(resolvedWorkspaceId)
          .slice(0, MAX_WORKSPACE_NOTES);
  }

  private resolveWorkspaceId(requestedId: number | null): number {
    if (requestedId !== null) {
      if (!this.workspaceRepository.existsById(requestedId)) {
        throw new Error('工作空间不存在 / Workspace not found');
      }
      return requestedId;
    }

    const existing = this.workspaceRepository.findAll()[0];
    if (existing) return existing.getId();

    const now = new Date();
    return this.workspaceRepository.create(
      new Workspace(0, 'Default Workspace', now, now),
    );
  }

  private getNoteWorkspaceId(noteId: number | null): number | null {
    if (noteId === null) return null;
    return this.noteRepository.findById(noteId)?.getWorkspaceId() ?? null;
  }

  private static defaultName(transcript: string): string {
    const normalized = transcript.replace(/\s+/g, ' ').trim();
    return normalized.slice(0, 64) || 'Untitled Note';
  }
}
