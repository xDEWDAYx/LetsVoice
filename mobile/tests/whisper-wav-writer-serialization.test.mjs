import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const writerPath = new URL(
  "../node_modules/whisper.rn/src/utils/WavFileWriter.ts",
  import.meta.url,
);
const patchPath = new URL(
  "../scripts/patch-whisper-wav-writer-serialization.mjs",
  import.meta.url,
);

test("WAV appends use one serialized drain and claim chunks before awaiting", async () => {
  const [writer, patch] = await Promise.all([
    readFile(writerPath, "utf8"),
    readFile(patchPath, "utf8"),
  ]);

  for (const value of [writer, patch]) {
    assert.match(value, /processingPromise: Promise<void> \| null/);
    assert.match(value, /return current\.then\(\(\) => this\.processWriteQueue\(\)\)/);
    assert.match(value, /const pending = this\.writeQueue\.splice\(0\)/);
    assert.match(value, /await this\.fs\.appendFile/);
    assert.match(value, /this\.writeQueue\.unshift\(\.\.\.pending\)/);
  }
});

test("WAV cancellation waits for an in-flight append before deleting the file", async () => {
  const writer = await readFile(writerPath, "utf8");
  const cancelStart = writer.indexOf("async cancel(): Promise<void>");
  const cancel = writer.slice(cancelStart);

  assert.ok(cancelStart >= 0);
  assert.ok(
    cancel.indexOf("await this.processingPromise?.catch") <
      cancel.indexOf("await this.fs.unlink"),
  );
});
