import { useTranslation } from 'react-i18next';
import { RecordingSession } from '../RecordingSession';
import { RecordingState } from '../RecordingTypes';
import TranscriptionController from '../TranscriptionController';
import useRecordingSession from '../useRecordingSession';
import { getLanguageLabel } from '../TranscriptionLanguageOptions';
import useTranscriptionController from '../useTranscriptionController';
import SoundWave from '../../../components/SoundWave';
import MarkdownText from '../../../components/Markdown/MarkdownText';

export default function TranscriptionPanel(props: {
  session: RecordingSession;
  transcription: TranscriptionController;
}) {
  const { t } = useTranslation();
  const { session, transcription } = props;
  const snapshot = useRecordingSession(session);
  const transcriptionSnapshot = useTranscriptionController(transcription);
  const {
    job,
    inputMode,
    uploadedFileName,
    uploadPending,
    uploadProgress,
    uploadLanguage,
    detectedLanguage,
    languageDetectionPending,
    languageDetectionError,
    languageConfirmationRequired,
    requestPending,
    liveSegments,
    livePendingCount,
    liveError,
    structuredNoteDraft,
    structuredNotePending,
    structuredNoteError,
  } = transcriptionSnapshot;
  const fileMode = inputMode === 'file';
  const fileAiProcessing =
    fileMode &&
    !uploadPending &&
    (languageDetectionPending ||
      requestPending ||
      job?.status === 'processing' ||
      structuredNotePending);
  const streamedText = liveSegments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(' ');
  const liveText =
    fileMode && job?.status === 'completed' && job.result
      ? job.result.text
      : streamedText;
  const showLive = fileMode
    ? Boolean(job) ||
      liveSegments.length > 0 ||
      structuredNotePending ||
      Boolean(liveError)
    : snapshot.state !== RecordingState.Idle &&
      (snapshot.state === RecordingState.Recording ||
        snapshot.state === RecordingState.Paused ||
        liveSegments.length > 0 ||
        livePendingCount > 0 ||
        Boolean(liveError));

  let liveStatus = t('recording.panel.status.completed');
  if (fileMode && job?.status === 'processing') {
    liveStatus =
      job.phase === 'preparing'
        ? t('recording.panel.status.preparing')
        : t('recording.panel.status.transcribing');
  } else if (fileMode && job?.status === 'failed') {
    liveStatus = t('recording.panel.status.failed');
  } else if (fileMode && job?.status === 'cancelled') {
    liveStatus = t('recording.panel.status.cancelled');
  } else if (snapshot.state === RecordingState.Paused) {
    liveStatus = t('recording.panel.status.paused');
  } else if (snapshot.state === RecordingState.Recording) {
    liveStatus = t('recording.panel.status.listening');
  } else if (livePendingCount > 0) {
    liveStatus = `${t('recording.panel.status.recognizingPrefix')}${livePendingCount}`;
  }

  let summaryStatus = t('recording.panel.summaryStatus.waiting');
  if (structuredNoteDraft)
    summaryStatus = t('recording.panel.summaryStatus.updated');
  if (structuredNotePending)
    summaryStatus = t('recording.panel.summaryStatus.analyzing');
  let displayState: string = snapshot.state;
  let displayStatus = snapshot.statusMessage;
  if (fileMode && job) {
    displayState = job.status;
    displayStatus = job.statusMessage;
  }
  if (fileMode && uploadPending) {
    displayState = 'processing';
    displayStatus = t('recording.panel.uploadingStatus');
  } else if (fileMode && languageDetectionPending) {
    displayState = 'processing';
    displayStatus = t('recording.panel.detectingLanguage');
  } else if (fileMode && requestPending) {
    displayState = 'processing';
    displayStatus = t('recording.panel.status.preparing');
  }
  const transcriptTitle = fileMode
    ? t('recording.panel.fileTranscription')
    : t('recording.panel.liveTranscription');
  const transcriptHint = fileMode
    ? t('recording.panel.hint.file')
    : t('recording.panel.hint.live');
  let emptyTranscriptText = t('recording.panel.empty.normal');
  if (fileMode) {
    emptyTranscriptText =
      job?.status === 'processing'
        ? t('recording.panel.empty.transcribingFile')
        : t('recording.panel.empty.fileReady');
  } else if (livePendingCount > 0) {
    emptyTranscriptText = t('recording.panel.empty.firstSegment');
  }
  let uploadedFileStatus =
    job?.statusMessage ?? t('recording.panel.waitingShort');
  if (uploadPending) {
    uploadedFileStatus = t('recording.panel.uploadingShort');
  } else if (languageDetectionPending) {
    uploadedFileStatus = t('recording.panel.detectingShort');
  } else if (requestPending) {
    uploadedFileStatus = t('recording.panel.status.preparing');
  } else if (structuredNotePending) {
    uploadedFileStatus = t('recording.panel.summaryStatus.analyzing');
  }

  // 正在录 / 正在转写时给面板挂上 is-live：状态徽章里的声波开始起伏，
  // 面板边缘的辉光环开始转。空闲和工作中必须一眼能分辨。
  const isLive =
    snapshot.state === RecordingState.Recording || fileAiProcessing;

  return (
    <section className={`recording-panel${isLive ? ' is-live' : ''}`}>
      <div className="recording-panel__header">
        <div>
          <p className="recording-panel__eyebrow">LOCAL AUDIO</p>
          <h1>{t('recording.panel.title')}</h1>
        </div>
        {/* 辉光环挂在徽章上而不是整块面板上：面板没有圆角也没有背景，
            套上去会是一圈方形的光，很脏。徽章是个有底色的胶囊，正合适。 */}
        <span
          className={`recording-state recording-state--${displayState} fx-halo${
            isLive ? ' is-live' : ''
          }`}
        >
          <SoundWave active={isLive} bars={5} size={13} />
          {displayState}
        </span>
      </div>

      <p className="recording-panel__status">{displayStatus}</p>

      {snapshot.errorMessage && (
        <p className="recording-panel__error" role="alert">
          {snapshot.errorMessage}
        </p>
      )}

      {transcriptionSnapshot.requestError && (
        <p className="recording-panel__error" role="alert">
          {transcriptionSnapshot.requestError}
        </p>
      )}

      {languageDetectionError && (
        <p className="recording-panel__error" role="alert">
          {languageDetectionError}
        </p>
      )}

      {fileMode && job?.errorMessage && (
        <p className="recording-panel__error" role="alert">
          {job.errorMessage}
        </p>
      )}

      <div className="recording-panel__content">
        {snapshot.state === RecordingState.Idle && !fileMode && (
          <div className="recording-input-guide">
            <strong>{t('recording.panel.chooseInputTitle')}</strong>
            <p>{t('recording.panel.chooseInputDesc')}</p>
            <div className="recording-input-guide__formats">
              {t('recording.panel.supportedFormats')}
            </div>
          </div>
        )}
        {(snapshot.state === RecordingState.Recording ||
          snapshot.state === RecordingState.Paused ||
          snapshot.state === RecordingState.Completed) && (
          <p>
            {t('recording.panel.receivedPrefix')}
            {(snapshot.bufferedBytes / 1024).toFixed(1)} KB
            {t('recording.panel.receivedSuffix')}
          </p>
        )}

        {fileMode && uploadedFileName && (
          <div className="recording-uploaded-file">
            <div>
              <span>{t('recording.panel.uploadedAudioLabel')}</span>
              <strong>{uploadedFileName}</strong>
              <span className="recording-uploaded-file__language">
                {languageDetectionPending &&
                  t('recording.panel.detectingStatus')}
                {!languageDetectionPending && detectedLanguage && (
                  <>
                    {t('recording.panel.detectedPrefix')}
                    <strong>
                      {getLanguageLabel(detectedLanguage.language)}
                    </strong>
                    {detectedLanguage.confidence !== null &&
                      detectedLanguage.source === 'whisper' &&
                      ` · ${Math.round(detectedLanguage.confidence * 100)}%`}
                    {detectedLanguage.source === 'model-fixed' &&
                      t('recording.panel.fixedByModel')}
                  </>
                )}
                {!languageDetectionPending &&
                  !detectedLanguage &&
                  uploadLanguage !== 'auto' && (
                    <>
                      {t('recording.panel.manualPrefix')}
                      <strong>{getLanguageLabel(uploadLanguage)}</strong>
                    </>
                  )}
              </span>
            </div>
            <span className="recording-uploaded-file__status">
              {fileAiProcessing && (
                <span
                  className="recording-processing-spinner"
                  aria-hidden="true"
                />
              )}
              <span>{uploadedFileStatus}</span>
            </span>
          </div>
        )}

        {fileMode && uploadPending && (
          <div
            className="recording-upload-progress"
            role="status"
            aria-live="polite"
          >
            <div>
              <span>{t('recording.panel.uploadingAudio')}</span>
              <strong>{uploadProgress?.percent ?? 0}%</strong>
            </div>
            <progress max={100} value={uploadProgress?.percent ?? 0} />
          </div>
        )}

        {fileMode && languageConfirmationRequired && (
          <p className="recording-language-warning" role="status">
            {t('recording.panel.languageWarning.zh')}
            <span>{t('recording.panel.languageWarning.en')}</span>
          </p>
        )}

        {showLive && (
          <div className="live-workspace" aria-live="polite">
            <section className="live-transcription">
              <header>
                <div>
                  <strong>{transcriptTitle}</strong>
                  <span>{transcriptHint}</span>
                </div>
                <span className="live-transcription__status">{liveStatus}</span>
              </header>

              {liveError && (
                <p className="recording-panel__error">{liveError}</p>
              )}

              <p className="live-transcription__text">
                {liveText || emptyTranscriptText}
              </p>
            </section>

            <section className="live-summary">
              <header>
                <div>
                  <strong>{t('recording.panel.liveSummaryTitle')}</strong>
                  <span>{t('recording.panel.liveSummaryModeLight')}</span>
                </div>
                <span className="live-summary__status">{summaryStatus}</span>
              </header>

              {structuredNoteError && (
                <p className="live-summary__notice">{structuredNoteError}</p>
              )}

              {structuredNoteDraft ? (
                <div className="live-summary__segments">
                  <div className="live-summary__result">
                    <MarkdownText content={structuredNoteDraft.summary} />
                  </div>
                </div>
              ) : (
                <p className="live-summary__empty">
                  {structuredNotePending
                    ? t('recording.panel.summaryEmpty.analyzing')
                    : t('recording.panel.summaryEmpty.waiting')}
                </p>
              )}
            </section>
          </div>
        )}

        {snapshot.savedRecording && (
          <div className="recording-panel__saved">
            <strong>{t('recording.panel.savedRecordingTitle')}</strong>
            <span>{snapshot.savedRecording.relativePath}</span>
            <span>
              {(snapshot.savedRecording.byteLength / 1024).toFixed(1)} KB ·{' '}
              {snapshot.savedRecording.mimeType}
            </span>
          </div>
        )}
        {job && !fileMode && (
          <section className="transcription-result">
            <header>
              <strong>{job.statusMessage}</strong>
              <span>{job.status}</span>
            </header>
            {job.errorMessage && (
              <p className="recording-panel__error">{job.errorMessage}</p>
            )}
            {job.result && (
              <>
                <p className="transcription-result__text">{job.result.text}</p>
                {job.result.segments.length > 0 && (
                  <ol className="transcription-segments">
                    {job.result.segments.map((segment) => (
                      <li key={segment.id}>
                        <time>{(segment.startMs / 1000).toFixed(1)}s</time>
                        <span>{segment.text}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
