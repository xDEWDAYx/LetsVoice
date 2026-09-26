/**
 * 基准测试用到的路径解析。
 *
 * 模型可能来自三个地方：
 *  1. 基准缓存目录（fetch-tts-models.ts 下载到这里，不污染应用状态）
 *  2. 应用自己的 userData 模型目录（用户已经在 App 里装过的模型）
 *  3. macOS/Linux 的系统 PATH（Homebrew 等包管理器安装的运行时）
 *
 * 两处都找，缓存优先，这样已经装过的 Kokoro 不必重复下载。
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import fs from 'fs';
import os from 'os';
import path from 'path';

export const PROJECT_ROOT = path.resolve(__dirname, '../..');

/** 基准测试自己的缓存根目录，与应用 userData 隔离。 */
export function benchmarkRoot(): string {
  if (process.env.TTS_BENCHMARK_ROOT) {
    return path.resolve(process.env.TTS_BENCHMARK_ROOT);
  }
  if (process.platform === 'win32') {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'SpeakSpace-TTS-Benchmark');
  }
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Caches',
      'SpeakSpace-TTS-Benchmark',
    );
  }
  return path.join(os.homedir(), '.cache', 'SpeakSpace-TTS-Benchmark');
}

export function benchmarkModelsRoot(): string {
  return path.join(benchmarkRoot(), 'models');
}

export function benchmarkSttModelsRoot(): string {
  return path.join(benchmarkModelsRoot(), 'stt');
}

/**
 * 测试结果的落地目录：固定在仓库内的 docs/testing/results/，不走 TTS_BENCHMARK_ROOT
 * 覆盖、也不跟着模型缓存搬家。结果要能提交进 git、跟着仓库分享到 GitHub 给所有人看，
 * 放在用户目录下的缓存里就做不到这一点。模型二进制文件（几百 MB 到近 1 GiB）体积太大，
 * 不适合进仓库，所以仍然留在 benchmarkModelsRoot() 那边的系统缓存目录。
 */
export function benchmarkResultsRoot(): string {
  return path.join(PROJECT_ROOT, 'docs', 'testing', 'results');
}

const ARCHIVED_PATH_KEYS = new Set([
  'model_dir',
  'model_path',
  'parent_model',
  'wav_path',
  'whisper_binary',
]);

function portableArchivedPath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const isAbsolute =
    path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized);
  if (!isAbsolute) return value;

  const resultMarker = '/docs/testing/results/';
  const resultIndex = normalized.lastIndexOf(resultMarker);
  if (resultIndex >= 0) {
    return `docs/testing/results/${normalized.slice(resultIndex + resultMarker.length)}`;
  }

  const benchmarkMarker = '/SpeakSpace-TTS-Benchmark/';
  const benchmarkIndex = normalized.lastIndexOf(benchmarkMarker);
  if (benchmarkIndex >= 0) {
    return normalized.slice(benchmarkIndex + benchmarkMarker.length);
  }

  for (const directory of ['models', 'runtimes']) {
    const marker = `/${directory}/`;
    const markerIndex = normalized.lastIndexOf(marker);
    if (markerIndex >= 0) {
      return `${directory}/${normalized.slice(markerIndex + marker.length)}`;
    }
  }

  return path.posix.basename(normalized);
}

/**
 * 结果可能由不同操作系统生成；展示文件名时不能使用当前平台的 path.basename，
 * 否则 macOS/Linux 会把 Windows 反斜杠路径原样写进报告和 SVG。
 */
export function portablePathBasename(value: string): string {
  return path.posix.basename(value.replace(/\\/g, '/'));
}

/**
 * 机器归档会提交到 GitHub，不应把运行者用户名和本机目录写进 JSON。
 * 这里只改写已知的路径字段；测量值、模型标识和网络地址保持原样。
 */
export function makeBenchmarkArtifactPortable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => makeBenchmarkArtifactPortable(item));
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (ARCHIVED_PATH_KEYS.has(key) && typeof item === 'string') {
        return [key, portableArchivedPath(item)];
      }
      return [key, makeBenchmarkArtifactPortable(item)];
    }),
  );
}

export function machineResultsMarkdownLink(machineId: string): string {
  return `./results/machines/${encodeURIComponent(machineId)}/`;
}

/** Electron userData 的候选位置。productName 改过名，所以历史目录也要看。 */
function userDataCandidates(): string[] {
  const names = [
    'SpeakSpace Local',
    'SpeakSpace',
    'speakspace',
    'electron-react-boilerplate',
  ];
  const roots: string[] = [];
  if (process.platform === 'win32') {
    const appData =
      process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    roots.push(appData);
  } else if (process.platform === 'darwin') {
    roots.push(path.join(os.homedir(), 'Library', 'Application Support'));
  } else {
    roots.push(
      process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
    );
  }
  return roots.flatMap((root) => names.map((name) => path.join(root, name)));
}

/** 找到某个 TTS 模型的实际目录；两处都没有就返回 null。 */
export function resolveTTSModelDir(modelId: string): string | null {
  const cached = path.join(benchmarkModelsRoot(), modelId);
  if (fs.existsSync(cached)) return cached;
  const installed = userDataCandidates()
    .map((base) => path.join(base, 'models', 'tts', modelId))
    .find((candidate) => fs.existsSync(candidate));
  return installed ?? null;
}

export function resolveSystemCommand(
  commands: string[],
  pathValue = process.env.PATH ?? '',
): string | null {
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const command of commands) {
      const candidate = path.join(directory, command);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // 继续检查下一个 PATH 候选。
      }
    }
  }
  return null;
}

/** whisper.cpp 的可执行文件与已安装的 ggml 模型，用于回转录。 */
export function resolveWhisper(): {
  binary: string | null;
  models: string[];
} {
  // 与 WhisperRuntimeService 保持同一优先级。whisper.cpp 1.9 起 main 只是一个
  // 废弃提示桩，直接调它会以退出码 1 结束，真正的可执行文件是 whisper-cli。
  const executables =
    process.platform === 'win32'
      ? ['whisper-cli.exe', 'main.exe']
      : ['whisper-cli', 'main'];
  const bases = userDataCandidates();
  const binary =
    [
      process.env.WHISPER_CLI,
      ...bases.flatMap((base) =>
        executables.map((executable) =>
          path.join(base, 'runtimes', 'stt', 'whisper', 'bin', executable),
        ),
      ),
      resolveSystemCommand(executables),
    ].find((candidate): candidate is string =>
      Boolean(candidate && fs.existsSync(candidate)),
    ) ?? null;
  const modelDir = [
    process.env.WHISPER_MODELS_DIR,
    benchmarkSttModelsRoot(),
    ...bases.map((base) => path.join(base, 'models', 'stt')),
  ]
    .filter((candidate): candidate is string => Boolean(candidate))
    .find((candidate) => fs.existsSync(candidate));
  const models = modelDir
    ? fs
        .readdirSync(modelDir)
        .filter((name) => name.endsWith('.bin'))
        .sort()
        .map((name) => path.join(modelDir, name))
    : [];
  return { binary, models };
}

export function directorySizeBytes(directory: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += directorySizeBytes(itemPath);
    else if (entry.isFile()) total += fs.statSync(itemPath).size;
  }
  return total;
}
