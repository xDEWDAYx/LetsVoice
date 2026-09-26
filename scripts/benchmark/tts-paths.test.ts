import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  makeBenchmarkArtifactPortable,
  machineResultsMarkdownLink,
  portablePathBasename,
  resolveSystemCommand,
  resolveWhisper,
} from './tts-paths';

describe('benchmark runtime discovery', () => {
  const originalEnv = { ...process.env };
  let temporaryRoot = '';

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'speakspace-benchmark-paths-'),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('finds Homebrew-style commands on PATH', () => {
    const binDir = path.join(temporaryRoot, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const executable = path.join(binDir, 'whisper-cli');
    fs.writeFileSync(executable, '#!/bin/sh\n');
    fs.chmodSync(executable, 0o755);

    expect(resolveSystemCommand(['whisper-cli'], binDir)).toBe(executable);
  });

  it('finds a system whisper CLI and benchmark-cached models', () => {
    const binDir = path.join(temporaryRoot, 'bin');
    const modelsDir = path.join(temporaryRoot, 'models', 'stt');
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(modelsDir, { recursive: true });
    const executable = path.join(binDir, 'whisper-cli');
    const model = path.join(modelsDir, 'ggml-tiny.bin');
    fs.writeFileSync(executable, '#!/bin/sh\n');
    fs.chmodSync(executable, 0o755);
    fs.writeFileSync(model, 'fixture');
    process.env.PATH = binDir;
    process.env.WHISPER_MODELS_DIR = modelsDir;

    expect(resolveWhisper()).toEqual({ binary: executable, models: [model] });
  });

  it('removes machine-specific absolute paths from archived JSON', () => {
    expect(
      makeBenchmarkArtifactPortable({
        model_dir:
          '/Users/alice/Library/Caches/SpeakSpace-TTS-Benchmark/models/moss-tts',
        cases: [
          {
            wav_path:
              '/Users/alice/project/docs/testing/results/wav/moss-tts/zh.wav',
          },
        ],
        whisper_binary: '/opt/homebrew/bin/whisper-cli',
        models: {
          small: {
            model_path:
              'C:\\Users\\Bob\\AppData\\Roaming\\SpeakSpace Local\\models\\stt\\ggml-small.bin',
          },
        },
        details: {
          parent_model:
            '/Users/runner/.ollama/models/blobs/sha256-model-fixture',
        },
        ollama_host: 'http://127.0.0.1:11434',
      }),
    ).toEqual({
      model_dir: 'models/moss-tts',
      cases: [{ wav_path: 'docs/testing/results/wav/moss-tts/zh.wav' }],
      whisper_binary: 'whisper-cli',
      models: {
        small: { model_path: 'models/stt/ggml-small.bin' },
      },
      details: { parent_model: 'models/blobs/sha256-model-fixture' },
      ollama_host: 'http://127.0.0.1:11434',
    });
  });

  it('builds a portable Markdown link for a machine result directory', () => {
    expect(machineResultsMarkdownLink('M2 Pro/16GB')).toBe(
      './results/machines/M2%20Pro%2F16GB/',
    );
  });

  it('extracts a filename from paths created on either operating system', () => {
    expect(portablePathBasename('/models/stt/ggml-large-v1.bin')).toBe(
      'ggml-large-v1.bin',
    );
    expect(
      portablePathBasename('C:\\Users\\Alice\\models\\stt\\ggml-large-v1.bin'),
    ).toBe('ggml-large-v1.bin');
  });
});
