import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(
  projectRoot,
  "node_modules",
  "@fugood",
  "react-native-audio-pcm-stream",
  "ios",
  "RNLiveAudioStream.m",
);

const original = `RCT_EXPORT_METHOD(stop) {
    RCTLogInfo(@"[RNLiveAudioStream] stop");
    if (_recordState.mIsRunning) {
        _recordState.mIsRunning = false;
        AudioQueueStop(_recordState.mQueue, true);
        for (int i = 0; i < kNumberBuffers; i++) {
            AudioQueueFreeBuffer(_recordState.mQueue, _recordState.mBuffers[i]);
        }
        AudioQueueDispose(_recordState.mQueue, true);
    }
}`;

const replacement = `RCT_REMAP_METHOD(stop,
                 stopWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
    RCTLogInfo(@"[RNLiveAudioStream] stop");
    if (_recordState.mIsRunning) {
        _recordState.mIsRunning = false;
        AudioQueueStop(_recordState.mQueue, true);
        for (int i = 0; i < kNumberBuffers; i++) {
            AudioQueueFreeBuffer(_recordState.mQueue, _recordState.mBuffers[i]);
        }
        AudioQueueDispose(_recordState.mQueue, true);
    }
    // Resolve only after AudioQueueStop(..., true) has synchronously drained
    // the native capture queue. JavaScript can now establish a safe final
    // transcription slice without racing buffered iOS audio events.
    resolve(nil);
}`;

const source = await readFile(target, "utf8");
if (source.includes(replacement)) {
  console.log("[patch-audio-pcm-stream] Awaitable iOS stop patch already applied.");
  process.exit(0);
}
if (!source.includes(original)) {
  throw new Error(
    "[patch-audio-pcm-stream] Expected iOS stop implementation was not found; dependency layout changed.",
  );
}

await writeFile(target, source.replace(original, replacement), "utf8");
console.log("[patch-audio-pcm-stream] Patched iOS stop into an awaitable native boundary.");
