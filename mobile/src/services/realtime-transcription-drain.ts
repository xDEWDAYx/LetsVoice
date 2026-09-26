type PendingRealtimeTranscription = {
  sliceIndex: number;
};

export type DrainableRealtimeTranscriber = {
  nextSlice: () => Promise<void>;
};

type RealtimeTranscriberQueueInternals = {
  isTranscribing: boolean;
  processingPromise: Promise<void> | null;
  transcriptionQueue: PendingRealtimeTranscription[];
};

/**
 * Force the current audio slice into the local STT queue and wait until every
 * item already in that queue has finished. whisper.rn's nextSlice() resolves
 * after enqueueing, not after inference, so callers need this extra boundary
 * before claiming that a paused recording's transcript is up to date.
 */
export async function flushCurrentTranscriptionSlice(
  transcriber: DrainableRealtimeTranscriber,
): Promise<void> {
  await transcriber.nextSlice();

  const queue = transcriber as DrainableRealtimeTranscriber &
    RealtimeTranscriberQueueInternals;
  if (
    !Array.isArray(queue.transcriptionQueue) ||
    typeof queue.isTranscribing !== "boolean" ||
    !(queue.processingPromise === null || queue.processingPromise instanceof Promise)
  ) {
    throw new Error(
      "The realtime transcription queue API changed; paused audio could not be drained safely.",
    );
  }

  while (
    queue.processingPromise !== null ||
    queue.transcriptionQueue.length > 0 ||
    queue.isTranscribing
  ) {
    const processing = queue.processingPromise;
    if (processing !== null) {
      await processing;
    } else {
      // Let whisper.rn publish the queue state changed by the preceding task.
      await Promise.resolve();
    }
  }
}
