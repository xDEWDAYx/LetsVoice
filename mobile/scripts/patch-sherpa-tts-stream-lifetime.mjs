import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(
  projectRoot,
  "node_modules",
  "react-native-sherpa-onnx",
  "android",
  "src",
  "main",
  "java",
  "com",
  "sherpaonnx",
  "SherpaOnnxTtsHelper.kt",
);

const original = `      val inst = instances.remove(instanceId)
      if (inst != null) {
        inst.stopPcmPlayer()
        inst.releaseEngines()
      }`;

const replacement = `      val inst = instances[instanceId]
      if (inst != null) {
        // Streaming synthesis runs on its own thread. Releasing OfflineTts while
        // that thread is inside native generation can abort the process.
        inst.ttsStreamCancelled.set(true)
        inst.ttsStreamThread?.interrupt()
        inst.stopPcmPlayer()
        val streamThread = inst.ttsStreamThread
        if (streamThread != null && streamThread !== Thread.currentThread()) {
          try {
            streamThread.join(5000)
          } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
          }
        }
        if (streamThread?.isAlive == true) {
          Log.w("SherpaOnnxTts", "TTS stream did not stop within 5s; keeping engine alive to avoid unsafe release")
        } else {
          instances.remove(instanceId, inst)
          inst.ttsStreamThread = null
          inst.releaseEngines()
        }
      }`;

try {
  await access(target);
} catch {
  console.warn("[patch-sherpa-tts] react-native-sherpa-onnx Android source not found; skipping.");
  process.exit(0);
}

const source = await readFile(target, "utf8");
if (source.includes(replacement)) {
  console.log("[patch-sherpa-tts] Android streaming TTS lifetime patch already applied.");
  process.exit(0);
}
if (!source.includes(original)) {
  throw new Error("[patch-sherpa-tts] Expected unloadTts implementation was not found; dependency layout changed.");
}

await writeFile(target, source.replace(original, replacement), "utf8");
console.log("[patch-sherpa-tts] Patched Android streaming TTS cancellation before engine release.");
