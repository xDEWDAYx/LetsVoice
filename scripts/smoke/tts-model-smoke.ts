import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import TTSEngine from '../../src/main/tts/TTSEngine';
import {
  KOKORO_TTS_MODEL_ID,
  MELO_TTS_MODEL_ID,
  MOSS_TTS_MODEL_ID,
} from '../../src/main/tts/TTSModelCatalog';

const aliases: Record<string, { id: string; speaker: string }> = {
  kokoro: { id: KOKORO_TTS_MODEL_ID, speaker: '45' },
  melo: { id: MELO_TTS_MODEL_ID, speaker: '0' },
  moss: { id: MOSS_TTS_MODEL_ID, speaker: 'Junhao' },
};

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const alias = valueAfter('--model') ?? '';
  const definition = aliases[alias];
  const modelDir = valueAfter('--model-dir');
  if (!definition || !modelDir) {
    throw new Error(
      'Usage: npm run smoke:tts -- --model <kokoro|melo|moss> --model-dir <directory>',
    );
  }
  const resolvedDir = path.resolve(modelDir);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Model directory does not exist: ${resolvedDir}`);
  }
  const text = valueAfter('--text') ?? '你好，Welcome to SpeakSpace Local.';
  const speaker = valueAfter('--speaker') ?? definition.speaker;
  const engine = new TTSEngine();
  const started = performance.now();
  try {
    const audio = await engine.generate(
      definition.id,
      resolvedDir,
      text,
      speaker,
      1,
    );
    const result = {
      modelId: definition.id,
      elapsedMs: Math.round(performance.now() - started),
      sampleRate: audio.sampleRate,
      channelCount: audio.channels.length,
      samplesPerChannel: audio.channels.map((channel) => channel.length),
      finite: audio.channels.every((channel) =>
        channel.every((sample) => Number.isFinite(sample)),
      ),
    };
    if (
      !result.finite ||
      result.channelCount < 1 ||
      result.channelCount > 2 ||
      result.samplesPerChannel.some((samples) => samples === 0)
    ) {
      throw new Error(`Invalid generated audio: ${JSON.stringify(result)}`);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    engine.dispose();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
