import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve(
  "node_modules/whisper.rn/cpp/jsi/RNWhisperJSI.cpp",
);
const jobCreation =
  "                    rnwhisper::job *job = rnwhisper::job_new(config.jobId, config.params);";
const patchedJobCreation = `                    // TranscribeConfig is captured by value for this async task.
                    // Rebind pointers that otherwise still reference the moved-from strings.
                    if (!config.language.empty()) {
                        config.params.language = config.language.c_str();
                    }
                    if (!config.prompt.empty()) {
                        config.params.initial_prompt = config.prompt.c_str();
                    }

${jobCreation}`;

const count = (text, value) => text.split(value).length - 1;
const source = readFileSync(sourcePath, "utf8");
const patchedCount = count(source, patchedJobCreation);

if (patchedCount === 2) {
  console.log("whisper.rn JSI string-lifetime patch already applied");
  process.exit(0);
}

if (patchedCount !== 0 || count(source, jobCreation) !== 2) {
  throw new Error(
    "whisper.rn native source changed; review the JSI string-lifetime patch before installing dependencies.",
  );
}

writeFileSync(sourcePath, source.replaceAll(jobCreation, patchedJobCreation));
console.log("Applied whisper.rn JSI string-lifetime patch");
