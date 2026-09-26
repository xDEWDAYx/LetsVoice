import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sourcePath = new URL(
  "../node_modules/whisper.rn/cpp/jsi/RNWhisperJSI.cpp",
  import.meta.url,
);
const source = readFileSync(sourcePath, "utf8");
const jobMarker =
  "rnwhisper::job *job = rnwhisper::job_new(config.jobId, config.params);";

test("Whisper async jobs rebind copied string pointers before native transcription", () => {
  const jobOffsets = [];
  let cursor = 0;

  while (true) {
    const offset = source.indexOf(jobMarker, cursor);
    if (offset === -1) break;
    jobOffsets.push(offset);
    cursor = offset + jobMarker.length;
  }

  assert.equal(jobOffsets.length, 2, "expected file and data transcription jobs");

  for (const offset of jobOffsets) {
    const setup = source.slice(Math.max(0, offset - 700), offset);
    assert.match(setup, /config\.params\.language = config\.language\.c_str\(\);/);
    assert.match(setup, /config\.params\.initial_prompt = config\.prompt\.c_str\(\);/);
  }
});
