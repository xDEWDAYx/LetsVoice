import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TranscriptionLanguage } from '@shared/types/TranscriptionTypes';
import { RecordingSession } from '../RecordingSession';
import { RecordingState, SavedRecording } from '../RecordingTypes';
import TranscriptionController, {
  isTranscriptionFileBusy,
} from '../TranscriptionController';
import {
  COMMON_LANGUAGE_OPTIONS,
  MORE_LANGUAGE_OPTIONS,
} from '../TranscriptionLanguageOptions';
import useRecordingSession from '../useRecordingSession';
import useTranscriptionController from '../useTranscriptionController';
import SaveToWorkspaceDialog, {
  WorkspaceSaveSelection,
} from './SaveToWorkspaceDialog';

function UploadLanguageSelect(props: {
  value: TranscriptionLanguage;
  disabled: boolean;
  onChange: (language: TranscriptionLanguage) => void;
}) {
  const { value, disabled, onChange } = props;
  const { t } = useTranslation();

  return (
    <label
      className="recording-language-select"
      htmlFor="upload-audio-language"
    >
      <span>{t('recording.control.audioLanguage')}</span>
      <select
        id="upload-audio-language"
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value as TranscriptionLanguage)
        }
      >
        <option value="auto">{t('recording.control.autoDetect')}</option>
        <optgroup label={t('recording.control.commonLanguages')}>
          {COMMON_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
        <optgroup label={t('recording.control.moreLanguages')}>
          {MORE_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

function buildTranscriptText(
  transcription: ReturnType<TranscriptionController['getSnapshot']>,
): string {
  const finalText = transcription.job?.result?.text?.trim();
  if (finalText) return finalText;

  return transcription.liveSegments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function defaultNoteName(
  fileMode: boolean,
  uploadedFileName: string | null,
): string {
  if (fileMode && uploadedFileName) {
    return uploadedFileName.replace(/\.[^.]+$/u, '').slice(0, 80);
  }

  return `Recording ${new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())}`;
}

export default function RecordControlBar(props: {
  session: RecordingSession;
  transcription: TranscriptionController;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, transcription } = props;
  const snapshot = useRecordingSession(session);
  const transcriptionSnapshot = useTranscriptionController(transcription);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [workspaceSaveError, setWorkspaceSaveError] = useState<string | null>(
    null,
  );
  const [workspaceSaveSuccess, setWorkspaceSaveSuccess] = useState<
    string | null
  >(null);
  const transcriptionRunning =
    transcriptionSnapshot.job?.status === 'processing';
  const fileMode = transcriptionSnapshot.inputMode === 'file';
  const fileBusy = isTranscriptionFileBusy(transcriptionSnapshot);
  const transcriptText = buildTranscriptText(transcriptionSnapshot);
  const structuredNoteBusy = transcriptionSnapshot.structuredNotePending;
  const fileReadyToSave =
    fileMode &&
    transcriptionSnapshot.job?.status === 'completed' &&
    Boolean(transcriptText);
  const microphoneReadyToSave =
    !fileMode &&
    (snapshot.state === RecordingState.Completed ||
      snapshot.state === RecordingState.Saved) &&
    Boolean(transcriptText);
  const canSaveToWorkspace =
    (fileReadyToSave || microphoneReadyToSave) && !structuredNoteBusy;
  const noteName = defaultNoteName(
    fileMode,
    transcriptionSnapshot.uploadedFileName,
  );

  const run = (operation: () => Promise<unknown>) => {
    operation().catch(() => undefined);
  };
  const clearWorkspaceSaveFeedback = () => {
    setWorkspaceSaveSuccess(null);
    setWorkspaceSaveError(null);
    setSaveDialogOpen(false);
  };
  const stopAndFinalize = async () => {
    await session.stop();
    await transcription.finalizeStructuredNote();
  };

  const openWorkspaceSave = () => {
    setWorkspaceSaveError(null);
    setSaveDialogOpen(true);
  };

  const saveToWorkspace = async (selection: WorkspaceSaveSelection) => {
    await transcription.finalizeStructuredNote();
    const latestTranscription = transcription.getSnapshot();
    const latestTranscriptText = buildTranscriptText(latestTranscription);
    if (!latestTranscriptText) {
      setWorkspaceSaveError(t('recording.control.noTranscriptToSave'));
      return;
    }
    if (!latestTranscription.structuredNoteDraft) {
      setWorkspaceSaveError(
        latestTranscription.structuredNoteError ||
          t('recording.control.structuredNoteRequired'),
      );
      return;
    }

    setWorkspaceSaving(true);
    setWorkspaceSaveError(null);
    let importedRecording: SavedRecording | null = null;

    try {
      let { workspaceId } = selection;
      let workspaceName = '';
      if (workspaceId === null) {
        const created = (await window.electron.workspace.create(
          selection.newWorkspaceName,
        )) as { id: number; name: string };
        workspaceId = created.id;
        workspaceName = created.name;
      } else {
        const workspaces = (await window.electron.workspace.getList(100)) as
          | Array<{ id: number; name: string }>
          | undefined;
        workspaceName =
          workspaces?.find((workspace) => workspace.id === workspaceId)?.name ??
          `Workspace ${workspaceId}`;
      }

      let audioRelativePath = snapshot.savedRecording?.relativePath ?? null;
      if (fileMode && latestTranscription.uploadedRecording) {
        audioRelativePath = latestTranscription.uploadedRecording.relativePath;
      } else if (fileMode && transcriptionSnapshot.uploadedFilePath) {
        importedRecording = (await window.electron.audio.importRecordingFile(
          transcriptionSnapshot.uploadedFilePath,
        )) as SavedRecording;
        audioRelativePath = importedRecording.relativePath;
      } else if (
        !fileMode &&
        snapshot.state === RecordingState.Completed &&
        !audioRelativePath
      ) {
        const savedRecording = await session.save();
        if (!savedRecording) {
          throw new Error(t('recording.control.saveRecordingFailed'));
        }
        audioRelativePath = savedRecording.relativePath;
      }

      const saveResult = await window.electron.workspace.saveTranscriptionNote({
        workspaceId,
        name: selection.noteName,
        transcript: latestTranscriptText,
        audioRelativePath,
        structuredNoteDraft: latestTranscription.structuredNoteDraft,
      });

      // Structured Note 已在保存前完成；这里只同步仪表盘使用的待办数据。
      window.electron.dashboard
        .extractTodosForNote(saveResult.noteId)
        .catch(console.error);

      setWorkspaceSaveSuccess(
        `${t('recording.control.savedToPrefix')}${workspaceName}${t('recording.control.savedToSuffix')}`,
      );
      setSaveDialogOpen(false);
      navigate('/Workspace');
    } catch (reason) {
      if (importedRecording) {
        await window.electron.audio
          .discardRecording(importedRecording.relativePath)
          .catch(() => undefined);
      }
      setWorkspaceSaveError(
        reason instanceof Error
          ? reason.message
          : t('recording.control.saveWorkspaceFailed'),
      );
    } finally {
      setWorkspaceSaving(false);
    }
  };

  return (
    <>
      <div className="recording-controls" aria-label="Recording controls">
        {snapshot.state === RecordingState.Idle && !fileMode && (
          <>
            <button
              type="button"
              disabled={snapshot.busy || fileBusy}
              onClick={() => {
                clearWorkspaceSaveFeedback();
                transcription.resetLive('microphone');
                run(() => session.start());
              }}
            >
              {t('recording.control.startRecording')}
            </button>
            <UploadLanguageSelect
              value={transcriptionSnapshot.uploadLanguage}
              disabled={fileBusy}
              onChange={(language) => transcription.setUploadLanguage(language)}
            />
            <button
              className="recording-button--secondary"
              type="button"
              disabled={fileBusy}
              onClick={() => {
                clearWorkspaceSaveFeedback();
                run(() => transcription.pickFileAndStart());
              }}
            >
              {t('recording.control.uploadAudio')}
            </button>
          </>
        )}

        {snapshot.state === RecordingState.Idle && fileMode && (
          <>
            {fileReadyToSave && (
              <button
                type="button"
                disabled={
                  !canSaveToWorkspace ||
                  workspaceSaving ||
                  Boolean(workspaceSaveSuccess)
                }
                onClick={openWorkspaceSave}
              >
                {workspaceSaveSuccess
                  ? t('recording.control.savedToWorkspace')
                  : t('recording.control.saveToWorkspace')}
              </button>
            )}
            <UploadLanguageSelect
              value={transcriptionSnapshot.uploadLanguage}
              disabled={fileBusy || workspaceSaving}
              onChange={(language) => transcription.setUploadLanguage(language)}
            />
            <button
              className="recording-button--secondary"
              type="button"
              disabled={fileBusy || !transcriptionSnapshot.uploadedFilePath}
              onClick={() => {
                clearWorkspaceSaveFeedback();
                run(() => transcription.retranscribeUploadedFile());
              }}
            >
              {transcriptionSnapshot.languageConfirmationRequired
                ? t('recording.control.confirmAndTranscribe')
                : t('recording.control.retranscribe')}
            </button>
            <button
              className="recording-button--secondary"
              type="button"
              disabled={fileBusy}
              onClick={() => {
                clearWorkspaceSaveFeedback();
                run(() => transcription.pickFileAndStart());
              }}
            >
              {t('recording.control.uploadAnother')}
            </button>
            <button
              className="recording-button--secondary"
              type="button"
              disabled={fileBusy || snapshot.busy}
              onClick={() => {
                clearWorkspaceSaveFeedback();
                transcription.resetLive('microphone');
                run(() => session.start());
              }}
            >
              {t('recording.control.newRecording')}
            </button>
          </>
        )}

        {snapshot.state === RecordingState.Recording && (
          <>
            <button type="button" onClick={() => session.pause()}>
              {t('recording.control.pause')}
            </button>
            <button
              type="button"
              disabled={snapshot.busy}
              onClick={() => run(stopAndFinalize)}
            >
              {t('recording.control.stop')}
            </button>
          </>
        )}

        {snapshot.state === RecordingState.Paused && (
          <>
            <button type="button" onClick={() => session.resume()}>
              {t('recording.control.resume')}
            </button>
            <button
              type="button"
              disabled={snapshot.busy}
              onClick={() => run(stopAndFinalize)}
            >
              {t('recording.control.stop')}
            </button>
          </>
        )}

        {snapshot.state === RecordingState.Completed && (
          <>
            <button
              type="button"
              disabled={
                !canSaveToWorkspace ||
                workspaceSaving ||
                Boolean(workspaceSaveSuccess)
              }
              onClick={openWorkspaceSave}
            >
              {workspaceSaveSuccess
                ? t('recording.control.savedToWorkspace')
                : t('recording.control.saveToWorkspace')}
            </button>
            <button
              className="recording-button--secondary"
              type="button"
              disabled={snapshot.busy}
              onClick={() => run(() => session.save())}
            >
              {t('recording.control.saveAudioOnly')}
            </button>
            <button
              className="recording-button--secondary"
              type="button"
              disabled={snapshot.busy}
              onClick={() => run(() => session.discard())}
            >
              {t('recording.control.discard')}
            </button>
          </>
        )}

        {snapshot.state === RecordingState.Saved && !fileMode && (
          <>
            {transcriptText && (
              <button
                type="button"
                disabled={
                  !canSaveToWorkspace ||
                  workspaceSaving ||
                  Boolean(workspaceSaveSuccess)
                }
                onClick={openWorkspaceSave}
              >
                {workspaceSaveSuccess
                  ? t('recording.control.savedToWorkspace')
                  : t('recording.control.saveToWorkspace')}
              </button>
            )}
            <button
              className="recording-button--secondary"
              type="button"
              disabled={fileBusy}
              onClick={() =>
                run(() =>
                  transcription.startRecording(
                    snapshot.savedRecording?.relativePath as string,
                  ),
                )
              }
            >
              {t('recording.control.fullRetranscribe')}
            </button>
            <button
              className="recording-button--secondary"
              type="button"
              disabled={snapshot.busy || transcriptionRunning}
              onClick={() => run(() => session.discard())}
            >
              {t('recording.control.deleteSavedRecording')}
            </button>
          </>
        )}

        {transcriptionRunning && (
          <button
            className="recording-button--secondary"
            type="button"
            disabled={transcriptionSnapshot.requestPending}
            onClick={() => run(() => transcription.cancel())}
          >
            {t('recording.control.cancelTranscription')}
          </button>
        )}

        {transcriptionSnapshot.job &&
          !fileMode &&
          (transcriptionSnapshot.job.status === 'failed' ||
            transcriptionSnapshot.job.status === 'cancelled') && (
            <button
              type="button"
              disabled={transcriptionSnapshot.requestPending}
              onClick={() => run(() => transcription.retry())}
            >
              {t('recording.control.retry')}
            </button>
          )}

        {workspaceSaveSuccess && (
          <span className="workspace-save-feedback" role="status">
            {workspaceSaveSuccess}
          </span>
        )}
      </div>

      <SaveToWorkspaceDialog
        open={saveDialogOpen}
        defaultNoteName={noteName}
        saving={workspaceSaving}
        error={workspaceSaveError}
        onClose={() => {
          if (!workspaceSaving) setSaveDialogOpen(false);
        }}
        onSave={saveToWorkspace}
      />
    </>
  );
}
