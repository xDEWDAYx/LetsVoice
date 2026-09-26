import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import type { TranscriptionJob } from '@shared/types/TranscriptionTypes';
import TranscriptionController from '../renderer/pages/Recording/TranscriptionController';
import useTranscriptionController from '../renderer/pages/Recording/useTranscriptionController';

type StatusListener = (job: unknown) => void;

const statusListeners: StatusListener[] = [];
const start = jest.fn();

const processingJob: TranscriptionJob = {
  id: 'uploaded-job',
  source: {
    kind: 'recording',
    relativePath: 'recordings/uploaded.wav',
    language: 'zh',
  },
  status: 'processing',
  phase: 'transcribing',
  statusMessage: 'Transcribing',
  errorMessage: null,
  result: null,
  attempt: 1,
  createdAt: '2026-08-25T10:00:00.000Z',
  updatedAt: '2026-08-25T10:00:00.000Z',
};

const completedJob: TranscriptionJob = {
  ...processingJob,
  status: 'completed',
  phase: 'completed',
  statusMessage: 'Completed',
  result: {
    text: '畫面上已經看得到的完整轉錄',
    segments: [],
    engine: 'whisper',
    modelId: 'whisper-test',
    modelName: 'Whisper Test',
    elapsedMs: 100,
  },
};

function TranscriptProbe({
  controller,
  reviewOpen,
  onGhostOpen,
}: {
  controller: TranscriptionController;
  reviewOpen: boolean;
  onGhostOpen: () => void;
}) {
  const snapshot = useTranscriptionController(controller);

  useEffect(() => {
    if (
      !reviewOpen &&
      snapshot.inputMode === 'file' &&
      snapshot.job?.status === 'completed' &&
      snapshot.job.result?.text
    ) {
      onGhostOpen();
    }
  }, [
    reviewOpen,
    snapshot.inputMode,
    snapshot.job?.status,
    snapshot.job?.result?.text,
    onGhostOpen,
  ]);

  return (
    <output data-testid="transcript">{snapshot.job?.result?.text ?? ''}</output>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  statusListeners.splice(0);
  start.mockResolvedValue(processingJob);
  (window as any).electron = {
    audio: {
      discardRecording: jest.fn().mockResolvedValue({ deleted: true }),
    },
    transcription: {
      onStatus: (listener: StatusListener) => {
        statusListeners.push(listener);
        return () => undefined;
      },
      onPartial: () => () => undefined,
      start,
    },
    knowledge: {
      generateStructuredNoteDraft: jest.fn(),
    },
  };
});

describe('useTranscriptionController controller identity', () => {
  it('switches away from the previous transcript as soon as the controller changes', async () => {
    const uploadedController = new TranscriptionController();
    await uploadedController.startRecording('recordings/uploaded.wav');
    statusListeners.forEach((listener) => listener(completedJob));

    const onGhostOpen = jest.fn();
    const { rerender } = render(
      <TranscriptProbe
        controller={uploadedController}
        reviewOpen
        onGhostOpen={onGhostOpen}
      />,
    );
    expect(screen.getByTestId('transcript')).toHaveTextContent(
      '畫面上已經看得到的完整轉錄',
    );

    // StudioPage.resetEngine() replaces the controller after closing/saving.
    // The UI must not keep the old transcript while saveAsNote reads the new,
    // empty controller; that mismatch produces "No transcript to save".
    const freshController = new TranscriptionController();
    rerender(
      <TranscriptProbe
        controller={freshController}
        reviewOpen={false}
        onGhostOpen={onGhostOpen}
      />,
    );

    expect(screen.getByTestId('transcript')).toBeEmptyDOMElement();
    expect(onGhostOpen).not.toHaveBeenCalled();
  });
});
