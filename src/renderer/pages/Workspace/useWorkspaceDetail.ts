import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import type { TrashActionResult } from '@shared/types/TrashTypes';
import {
  NoteItem,
  WorkspaceController,
  WorkspaceItem,
} from './WorkspaceController';

const workspaceController = new WorkspaceController();

/** 工作空间详情的数据读取与修改集中在 Hook，页面组件只负责排版。 */
export default function useWorkspaceDetail() {
  const { t } = useTranslation();
  const { workspaceId: rawWorkspaceId } = useParams();
  const workspaceId = Number(rawWorkspaceId);
  const [workspace, setWorkspace] = useState<WorkspaceItem | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);

  const toggleNoteSelection = useCallback((noteId: number) => {
    setSelectedNoteIds((prev) =>
      prev.includes(noteId)
        ? prev.filter((id) => id !== noteId)
        : [...prev, noteId],
    );
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
      setWorkspace(null);
      setError('无效的工作空间 ID');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      // 进入详情时记录访问时间，再读取当前空间的笔记。
      const openedWorkspace =
        await workspaceController.openWorkspace(workspaceId);
      const workspaceNotes =
        await workspaceController.getWorkspaceNotes(workspaceId);
      setWorkspace(openedWorkspace);
      setNotes(workspaceNotes);
    } catch (reason) {
      setWorkspace(null);
      setError(WorkspaceController.getErrorMessage(reason, '读取工作空间失败'));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const reloadNotes = useCallback(async () => {
    const workspaceNotes =
      await workspaceController.getWorkspaceNotes(workspaceId);
    setNotes(workspaceNotes);
    setSelectedNoteIds((current) =>
      current.filter((id) => workspaceNotes.some((note) => note.id === id)),
    );
    return workspaceNotes;
  }, [workspaceId]);

  const createNote = useCallback(
    async (name: string, transcript: string): Promise<number> => {
      try {
        setError('');
        setStatus('');
        const created = (await window.electron.workspace.saveTranscriptionNote({
          workspaceId,
          name,
          transcript,
          summaries: [],
        })) as { noteId: number };
        await reloadNotes();
        setStatus(t('workspace.note.createSuccess'));
        return created.noteId;
      } catch (reason) {
        const message = WorkspaceController.getErrorMessage(
          reason,
          t('workspace.note.createFailed'),
        );
        setError(message);
        throw new Error(message);
      }
    },
    [reloadNotes, t, workspaceId],
  );

  const renameWorkspace = useCallback(
    async (nextName: string) => {
      if (!workspace) return;
      if (!nextName?.trim() || nextName.trim() === workspace.name) return;
      try {
        setError('');
        await workspaceController.renameWorkspace(workspace.id, nextName);
        setWorkspace(await workspaceController.openWorkspace(workspace.id));
      } catch (reason) {
        setError(WorkspaceController.getErrorMessage(reason, '重命名失败'));
      }
    },
    [workspace],
  );

  const moveWorkspaceToTrash = useCallback(async (): Promise<
    TrashActionResult | undefined
  > => {
    if (!workspace) return undefined;
    try {
      setError('');
      return (await window.electron.trash.moveWorkspace(
        workspace.id,
      )) as TrashActionResult;
    } catch (reason) {
      setError(
        WorkspaceController.getErrorMessage(reason, t('trash.error.move')),
      );
      return undefined;
    }
  }, [t, workspace]);

  const moveNoteToTrash = useCallback(
    async (noteId: number) => {
      try {
        setError('');
        const result = (await window.electron.trash.moveNote(
          noteId,
        )) as TrashActionResult;
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        setSelectedNoteIds((current) => current.filter((id) => id !== noteId));
        return result;
      } catch (reason) {
        setError(
          WorkspaceController.getErrorMessage(reason, t('trash.error.move')),
        );
        return undefined;
      }
    },
    [t],
  );

  const revealNote = useCallback((noteId: number) => {
    setQuery('');
    requestAnimationFrame(() => {
      document.getElementById(`workspace-note-${noteId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, []);

  return {
    workspaceId,
    workspace,
    loading,
    error,
    status,
    query,
    setQuery,
    selectedNoteIds,
    toggleNoteSelection,
    setSelectedNoteIds,
    createNote,
    renameWorkspace,
    moveWorkspaceToTrash,
    moveNoteToTrash,
    reloadNotes,
    revealNote,
    visibleNotes: WorkspaceController.filterNotes(notes, query),
  };
}
