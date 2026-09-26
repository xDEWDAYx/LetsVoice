import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { flushCurrentTranscriptionSlice } from "../src/services/realtime-transcription-drain.ts";

const transcriptionServicePath = new URL(
  "../src/services/transcription-service.ts",
  import.meta.url,
);
const transcriptionScreenPath = new URL(
  "../src/app/transcription.tsx",
  import.meta.url,
);
const packagePath = new URL("../package.json", import.meta.url);
const nativeStopPatchPath = new URL(
  "../scripts/patch-audio-pcm-stream-ios-stop.mjs",
  import.meta.url,
);
const require = createRequire(import.meta.url);
const { RealtimeTranscriber } = require(
  "../node_modules/whisper.rn/lib/commonjs/realtime-transcription/RealtimeTranscriber.js",
);

class FakeAudioStream {
  recording = false;
  dataCallback = null;
  statusCallback = null;

  async initialize() {}

  async start() {
    this.recording = true;
    this.statusCallback?.(true);
  }

  async stop() {
    this.recording = false;
    this.statusCallback?.(false);
  }

  isRecording() {
    return this.recording;
  }

  onData(callback) {
    this.dataCallback = callback;
  }

  onError() {}

  onStatusChange(callback) {
    this.statusCallback = callback;
  }

  async release() {}

  emit(data) {
    this.dataCallback?.({
      channels: 1,
      data,
      sampleRate: 16_000,
      timestamp: Date.now(),
    });
  }
}

test("pausing waits for the already-captured transcription queue to drain", async () => {
  let finishProcessing;
  const processingPromise = new Promise((resolve) => {
    finishProcessing = resolve;
  });
  const transcriber = {
    isTranscribing: true,
    processingPromise,
    transcriptionQueue: [{ sliceIndex: 0 }],
    async nextSlice() {},
  };

  let drained = false;
  const drainPromise = flushCurrentTranscriptionSlice(transcriber).then(() => {
    drained = true;
  });
  await Promise.resolve();
  assert.equal(drained, false);

  transcriber.transcriptionQueue.length = 0;
  transcriber.isTranscribing = false;
  transcriber.processingPromise = null;
  finishProcessing();
  await drainPromise;

  assert.equal(drained, true);
});

test("pausing an empty slice resolves without inventing transcription work", async () => {
  let nextSliceCalls = 0;
  const transcriber = {
    isTranscribing: false,
    processingPromise: null,
    transcriptionQueue: [],
    async nextSlice() {
      nextSliceCalls += 1;
    },
  };

  await flushCurrentTranscriptionSlice(transcriber);

  assert.equal(nextSliceCalls, 1);
});

test("the whisper.rn queue finishes captured text before pause catch-up resolves", async () => {
  const audioStream = new FakeAudioStream();
  const transcripts = [];
  let requestNumber = 0;
  const context = {
    transcribeData(audioData) {
      const currentRequest = ++requestNumber;
      return {
        promise: new Promise((resolve) => {
          setTimeout(() => resolve({
            result: `segment-${currentRequest}-bytes-${audioData.byteLength}`,
            segments: [],
          }), 20);
        }),
      };
    },
  };
  const transcriber = new RealtimeTranscriber(
    { audioStream, parakeetContext: context },
    {
      audioSliceSec: 8,
      initRealtimeAfterMs: 1,
      realtimeProcessingPauseMs: 1,
    },
    {
      onTranscribe(event) {
        if (event.data?.result) transcripts.push(event.data.result);
      },
    },
  );

  try {
    await transcriber.start();
    audioStream.emit(new Uint8Array(32_000));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await audioStream.stop();

    await flushCurrentTranscriptionSlice(transcriber);

    assert.deepEqual(transcripts, [
      "segment-1-bytes-32000",
      "segment-2-bytes-32000",
    ]);
    assert.equal(transcriber.getStatistics().isTranscribing, false);
  } finally {
    await transcriber.release();
  }
});

test("the recording screen distinguishes paused capture from transcript catch-up", async () => {
  const [service, screen] = await Promise.all([
    readFile(transcriptionServicePath, "utf8"),
    readFile(transcriptionScreenPath, "utf8"),
  ]);

  assert.match(service, /await flushCurrentTranscriptionSlice\(this\.transcriber\)/);
  assert.match(screen, /isCompletingPausedTranscript/);
  assert.match(screen, /Completing transcript/);
  assert.match(screen, /Finishing text from audio already captured/);
});

test("the iOS recorder stop bridge is patched into an awaitable boundary", async () => {
  const [packageJson, patchScript] = await Promise.all([
    readFile(packagePath, "utf8"),
    readFile(nativeStopPatchPath, "utf8"),
  ]);

  assert.match(packageJson, /patch-audio-pcm-stream-ios-stop\.mjs/);
  assert.match(patchScript, /RCT_REMAP_METHOD\(stop/);
  assert.match(patchScript, /resolve\(nil\)/);
});
