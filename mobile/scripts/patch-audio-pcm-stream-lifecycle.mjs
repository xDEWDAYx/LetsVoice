import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve(
  "node_modules/@fugood/react-native-audio-pcm-stream/android/src/main/java/com/imxiqi/rnliveaudiostream/RNLiveAudioStreamModule.java",
);
const adapterTarget = resolve(
  "node_modules/whisper.rn/src/realtime-transcription/adapters/AudioPcmStreamAdapter.ts",
);

const oldFields = `    private boolean isRecording;`;
const newFields = `    private volatile boolean isRecording;
    private Thread recordingThread = null;
    private Promise stopPromise = null;`;

const oldRecorderCreation = `        int recordingBufferSize = bufferSize * 3;
        recorder = new AudioRecord(audioSource, sampleRateInHz, channelConfig, audioFormat, recordingBufferSize);`;
const newRecorderCreation = `        int recordingBufferSize = bufferSize * 3;
        if (recorder != null) {
            recorder.release();
            recorder = null;
        }
        recorder = new AudioRecord(audioSource, sampleRateInHz, channelConfig, audioFormat, recordingBufferSize);`;

const oldInitFailure = `        if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
            promise.reject("AudioRecord initialization failed");
            recorder = null;
        } else {`;
const newInitFailure = `        if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
            AudioRecord failedRecorder = recorder;
            recorder = null;
            failedRecorder.release();
            promise.reject("AudioRecord initialization failed");
        } else {`;

const oldLifecycle = `    @ReactMethod
    public void start() {
        if (recorder == null || isRecording) return;
        isRecording = true;
        recorder.startRecording();

        Thread recordingThread = new Thread(new Runnable() {
            public void run() {
                try {
                    int bytesRead;
                    int count = 0;
                    String base64Data;
                    byte[] buffer = new byte[bufferSize];

                    while (isRecording) {
                        bytesRead = recorder.read(buffer, 0, buffer.length);

                        // skip first 2 buffers to eliminate "click sound"
                        if (bytesRead > 0 && ++count > 2) {
                            base64Data = Base64.encodeToString(buffer, Base64.NO_WRAP);
                            eventEmitter.emit("data", base64Data);
                        }
                    }
                    recorder.stop();
                } catch (Exception e) {
                    e.printStackTrace();
                } finally {
                    recorder.release();
                    recorder = null;
                }
            }
        });

        recordingThread.start();
    }

    @ReactMethod
    public void stop() {
        isRecording = false;
    }`;

const newLifecycle = `    @ReactMethod
    public synchronized void start(Promise promise) {
        if (recorder == null) {
            promise.reject("AudioRecord is not initialized");
            return;
        }
        if (isRecording) {
            promise.resolve(null);
            return;
        }
        if (recordingThread != null) {
            promise.reject("AudioRecord is still stopping");
            return;
        }

        final AudioRecord activeRecorder = recorder;
        try {
            activeRecorder.startRecording();
        } catch (Exception error) {
            promise.reject("AudioRecord start failed", error);
            return;
        }
        isRecording = true;

        recordingThread = new Thread(new Runnable() {
            public void run() {
                try {
                    int bytesRead;
                    int count = 0;
                    String base64Data;
                    byte[] buffer = new byte[bufferSize];

                    while (isRecording) {
                        bytesRead = activeRecorder.read(buffer, 0, buffer.length);
                        if (bytesRead < 0) {
                            throw new IllegalStateException("AudioRecord read failed: " + bytesRead);
                        }

                        // Skip the first two buffers to eliminate the recorder click.
                        if (bytesRead > 0 && ++count > 2) {
                            // A read may return fewer bytes than requested. Encoding the
                            // entire array repeats stale PCM and degrades recognition.
                            base64Data = Base64.encodeToString(
                                buffer,
                                0,
                                bytesRead,
                                Base64.NO_WRAP
                            );
                            eventEmitter.emit("data", base64Data);
                        }
                    }
                } catch (Exception error) {
                    if (isRecording) {
                        Log.e("RNLiveAudioStream", "Audio capture failed", error);
                    }
                } finally {
                    try {
                        if (activeRecorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                            activeRecorder.stop();
                        }
                    } catch (Exception error) {
                        Log.w("RNLiveAudioStream", "AudioRecord stop failed", error);
                    }
                    activeRecorder.release();

                    Promise pendingStop;
                    synchronized (RNLiveAudioStreamModule.this) {
                        if (recorder == activeRecorder) {
                            recorder = null;
                        }
                        recordingThread = null;
                        isRecording = false;
                        pendingStop = stopPromise;
                        stopPromise = null;
                    }
                    if (pendingStop != null) {
                        pendingStop.resolve(null);
                    }
                }
            }
        }, "LetsVoiceAudioCapture");

        recordingThread.start();
        promise.resolve(null);
    }

    @ReactMethod
    public synchronized void stop(Promise promise) {
        if (recordingThread == null) {
            isRecording = false;
            if (recorder != null) {
                recorder.release();
                recorder = null;
            }
            promise.resolve(null);
            return;
        }
        if (stopPromise != null) {
            promise.reject("AudioRecord stop is already in progress");
            return;
        }

        stopPromise = promise;
        isRecording = false;
        try {
            if (recorder != null && recorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                recorder.stop();
            }
        } catch (Exception error) {
            Log.w("RNLiveAudioStream", "AudioRecord stop request failed", error);
        }
    }`;

const oldClickSkip = `                    int count = 0;
                    String base64Data;
                    byte[] buffer = new byte[bufferSize];

                    while (isRecording) {
                        bytesRead = activeRecorder.read(buffer, 0, buffer.length);
                        if (bytesRead < 0) {
                            throw new IllegalStateException("AudioRecord read failed: " + bytesRead);
                        }

                        // Skip the first two buffers to eliminate the recorder click.
                        if (bytesRead > 0 && ++count > 2) {
                            // A read may return fewer bytes than requested. Encoding the
                            // entire array repeats stale PCM and degrades recognition.
                            base64Data = Base64.encodeToString(
                                buffer,
                                0,
                                bytesRead,
                                Base64.NO_WRAP
                            );
                            eventEmitter.emit("data", base64Data);
                        }
                    }`;

const newClickSkip = `                    int channelCount = channelConfig == AudioFormat.CHANNEL_IN_STEREO ? 2 : 1;
                    int bytesPerSample = audioFormat == AudioFormat.ENCODING_PCM_8BIT ? 1 : 2;
                    int bytesToSkip = sampleRateInHz * channelCount * bytesPerSample * 40 / 1000;
                    String base64Data;
                    byte[] buffer = new byte[bufferSize];

                    while (isRecording) {
                        bytesRead = activeRecorder.read(buffer, 0, buffer.length);
                        if (bytesRead < 0) {
                            throw new IllegalStateException("AudioRecord read failed: " + bytesRead);
                        }

                        // Ignore only a 40 ms click guard. The upstream two-buffer
                        // guard discards about one full second at our 16 KB buffer size.
                        int offset = 0;
                        if (bytesRead > 0 && bytesToSkip > 0) {
                            offset = Math.min(bytesRead, bytesToSkip);
                            bytesToSkip -= offset;
                        }
                        int outputBytes = bytesRead - offset;
                        if (outputBytes > 0) {
                            // A read may return fewer bytes than requested. Encoding the
                            // entire array repeats stale PCM and degrades recognition.
                            base64Data = Base64.encodeToString(
                                buffer,
                                offset,
                                outputBytes,
                                Base64.NO_WRAP
                            );
                            eventEmitter.emit("data", base64Data);
                        }
                    }`;

const oldAdapterInit = `      LiveAudioStream.init({`;
const newAdapterInit = `      await LiveAudioStream.init({`;
const oldAdapterStart = `      LiveAudioStream.start()
      this.recording = true`;
const newAdapterStart = `      await LiveAudioStream.start()
      this.recording = true`;

const count = (source, value) => source.split(value).length - 1;
const source = await readFile(target, "utf8");
const adapterSource = await readFile(adapterTarget, "utf8");

const javaPatched =
  source.includes(newFields) &&
  source.includes(newRecorderCreation) &&
  source.includes(newInitFailure) &&
  source.includes("public synchronized void stop(Promise promise)") &&
  source.includes(newClickSkip);
const adapterPatched =
  adapterSource.includes(newAdapterInit) &&
  adapterSource.includes(newAdapterStart);

if (javaPatched && adapterPatched) {
  console.log("Android PCM capture lifecycle patch already applied");
  process.exit(0);
}

if (!javaPatched) {
  let patched = source;
  for (const [label, oldText, newText] of [
    ["field declaration", oldFields, newFields],
    ["recorder creation", oldRecorderCreation, newRecorderCreation],
    ["initialization failure cleanup", oldInitFailure, newInitFailure],
  ]) {
    if (patched.includes(newText)) continue;
    if (count(patched, oldText) !== 1) {
      throw new Error(
        `Audio PCM dependency changed; expected exactly one ${label} marker.`,
      );
    }
    patched = patched.replace(oldText, newText);
  }

  if (!patched.includes("public synchronized void stop(Promise promise)")) {
    if (count(patched, oldLifecycle) !== 1) {
      throw new Error(
        "Audio PCM dependency changed; expected exactly one start/stop lifecycle marker.",
      );
    }
    patched = patched.replace(oldLifecycle, newLifecycle);
  }
  if (!patched.includes(newClickSkip)) {
    if (count(patched, oldClickSkip) !== 1) {
      throw new Error(
        "Audio PCM dependency changed; expected exactly one startup click-guard marker.",
      );
    }
    patched = patched.replace(oldClickSkip, newClickSkip);
  }
  await writeFile(target, patched, "utf8");
}

if (!adapterPatched) {
  let patchedAdapter = adapterSource;
  for (const [label, oldText, newText] of [
    ["initialize", oldAdapterInit, newAdapterInit],
    ["start", oldAdapterStart, newAdapterStart],
  ]) {
    if (patchedAdapter.includes(newText)) continue;
    if (count(patchedAdapter, oldText) !== 1) {
      throw new Error(
        `whisper.rn audio adapter changed; expected exactly one ${label} marker.`,
      );
    }
    patchedAdapter = patchedAdapter.replace(oldText, newText);
  }
  await writeFile(adapterTarget, patchedAdapter, "utf8");
}

console.log(
  "Patched Android PCM capture lifecycle, exact buffer length, and awaited start",
);
