import { Note } from '@shared/entities/Note';
import { NoteRepository } from '../database/repositories/NoteRepository';
import { AgentContext } from './AgentTypes';

export const MAX_NOTE_PREVIEW_CHARACTERS = 240;

export type AgentNoteSource = Pick<
  NoteRepository,
  'findAll' | 'findAllByWorkspace' | 'findById'
>;

export function previewNoteText(
  value: string,
  limit = MAX_NOTE_PREVIEW_CHARACTERS,
): string {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}...`;
}

export function serializeAgentNote(note: Note): Record<string, unknown> {
  return {
    id: note.getId(),
    workspaceId: note.getWorkspaceId(),
    name: note.getName() || `Note ${note.getId()}`,
    transcriptPreview: previewNoteText(note.getTranscript()),
  };
}

export function listScopedAgentNotes(
  notes: AgentNoteSource,
  context: AgentContext,
): Note[] {
  const linked = context.linkedNoteIds ?? [];
  if (linked.length > 0) {
    return linked
      .map((id) => notes.findById(id))
      .filter((note): note is Note => note !== null && note !== undefined);
  }
  return context.workspaceId === null
    ? notes.findAll()
    : notes.findAllByWorkspace(context.workspaceId);
}

/** 有手动关联时以其为准；否则沿用工作空间 / 全库范围。 */
export function isAgentNoteInScope(note: Note, context: AgentContext): boolean {
  const linked = context.linkedNoteIds ?? [];
  if (linked.length > 0) return linked.includes(note.getId());
  return (
    context.workspaceId === null ||
    note.getWorkspaceId() === context.workspaceId
  );
}
