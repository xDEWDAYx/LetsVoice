import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve("node_modules/whisper.rn/src/utils/WavFileWriter.ts");
const oldFields = `  private writeQueue: Uint8Array[] = []`;
const newFields = `  private writeQueue: Uint8Array[] = []

  private processingPromise: Promise<void> | null = null`;

const oldProcessor = `  private async processWriteQueue(): Promise<void> {
    if (this.writeQueue.length === 0) {
      return
    }

    try {
      // Combine all queued data
      const totalLength = this.writeQueue.reduce((sum, data) => sum + data.length, 0)
      const combinedData = new Uint8Array(totalLength)

      let offset = 0
      this.writeQueue.forEach(data => {
        combinedData.set(new Uint8Array(data), offset)
        offset += data.length
      })

      // Append to file
      const base64Data = uint8ArrayToBase64(combinedData)
      await this.fs.appendFile(this.filePath, base64Data, 'base64')

      // Update data size
      this.dataSize += combinedData.length

      // Clear the queue
      this.writeQueue = []
    } catch (error) {
      console.warn(\`Failed to process WAV write queue: \${error}\`)
      // Don't throw here to avoid breaking the recording
    }
  }`;

const previousProcessor = `  private processWriteQueue(): Promise<void> {
    if (this.processingPromise !== null) {
      return this.processingPromise
    }
    if (this.writeQueue.length === 0) {
      return Promise.resolve()
    }

    const processing = this.drainWriteQueue()
    this.processingPromise = processing.finally(() => {
      this.processingPromise = null
    })
    return this.processingPromise
  }

  private async drainWriteQueue(): Promise<void> {
    while (this.writeQueue.length > 0) {
      // Claim queued chunks before awaiting the filesystem. New chunks remain
      // queued for the next loop and can never be appended twice.
      const pending = this.writeQueue.splice(0)
      const totalLength = pending.reduce((sum, data) => sum + data.length, 0)
      const combinedData = new Uint8Array(totalLength)

      let offset = 0
      pending.forEach(data => {
        combinedData.set(data, offset)
        offset += data.length
      })

      try {
        const base64Data = uint8ArrayToBase64(combinedData)
        await this.fs.appendFile(this.filePath, base64Data, 'base64')
        this.dataSize += combinedData.length
      } catch (error) {
        this.writeQueue.unshift(...pending)
        throw error
      }
    }
  }`;

const newProcessor = `  private processWriteQueue(): Promise<void> {
    if (this.processingPromise !== null) {
      // A chunk can arrive after the active drain observed an empty queue but
      // before its finally callback clears processingPromise. Join that drain,
      // then check the queue again so finalize() cannot miss the last chunk.
      const current = this.processingPromise
      return current.then(() => this.processWriteQueue())
    }
    if (this.writeQueue.length === 0) {
      return Promise.resolve()
    }

    const processing = this.drainWriteQueue()
    this.processingPromise = processing.finally(() => {
      this.processingPromise = null
    })
    return this.processingPromise
  }

  private async drainWriteQueue(): Promise<void> {
    while (this.writeQueue.length > 0) {
      // Claim queued chunks before awaiting the filesystem. New chunks remain
      // queued for the next loop and can never be appended twice.
      const pending = this.writeQueue.splice(0)
      const totalLength = pending.reduce((sum, data) => sum + data.length, 0)
      const combinedData = new Uint8Array(totalLength)

      let offset = 0
      pending.forEach(data => {
        combinedData.set(data, offset)
        offset += data.length
      })

      try {
        const base64Data = uint8ArrayToBase64(combinedData)
        await this.fs.appendFile(this.filePath, base64Data, 'base64')
        this.dataSize += combinedData.length
      } catch (error) {
        this.writeQueue.unshift(...pending)
        throw error
      }
    }
  }`;

const oldCancel = `  async cancel(): Promise<void> {
    this.isWriting = false
    this.writeQueue = []

    try {`;
const newCancel = `  async cancel(): Promise<void> {
    this.isWriting = false
    this.writeQueue = []
    await this.processingPromise?.catch(() => undefined)
    this.processingPromise = null

    try {`;

const source = await readFile(target, "utf8");

if (
  source.includes(newFields) &&
  source.includes(newProcessor) &&
  source.includes(newCancel)
) {
  console.log("whisper.rn WAV serialization patch already applied");
  process.exit(0);
}

const count = (value, marker) => value.split(marker).length - 1;
const replaceOrVerify = (value, oldText, newText, label) => {
  if (value.includes(newText)) return value;
  if (count(value, oldText) !== 1) {
    throw new Error(
      `whisper.rn WAV writer changed; expected exactly one ${label} marker.`,
    );
  }
  return value.replace(oldText, newText);
};

let patched = replaceOrVerify(source, oldFields, newFields, "writer fields");
if (!patched.includes(newProcessor)) {
  if (count(patched, previousProcessor) === 1) {
    patched = patched.replace(previousProcessor, newProcessor);
  } else if (count(patched, oldProcessor) === 1) {
    patched = patched.replace(oldProcessor, newProcessor);
  } else {
    throw new Error(
      "whisper.rn WAV writer changed; expected exactly one queue processor marker.",
    );
  }
}
patched = replaceOrVerify(
  patched,
  oldCancel,
  newCancel,
  "cancel lifecycle",
);

await writeFile(target, patched, "utf8");
console.log("Patched whisper.rn WAV writes to serialize queued PCM chunks");
