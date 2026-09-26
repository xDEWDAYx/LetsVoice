import type {
  RuntimeInstallSupport,
  RuntimeInstallSupportSummary,
  RuntimeInstallTarget,
} from '@shared/types/RuntimeTypes';

export type {
  RuntimeInstallSupport,
  RuntimeInstallSupportSummary,
  RuntimeInstallTarget,
};

/**
 * 三个可下载运行时目前都只做了 Windows 便携包的自动安装。
 * 平台判断集中在这里：Renderer 据此决定「显示安装按钮」还是「显示手动安装说明」，
 * 各个 ReleaseClient 也据此抛错，避免两边对「支持哪些平台」的认知走偏。
 */
const MANUAL_HINTS: Record<
  RuntimeInstallTarget,
  Partial<Record<NodeJS.Platform, string>> & { default: string }
> = {
  whisper: {
    darwin: '请执行 brew install whisper-cpp 后重启应用',
    linux: '请用系统包管理器安装 whisper-cli 后重启应用',
    default: '请自行安装 whisper-cli 并确保它在 PATH 中',
  },
  ffmpeg: {
    darwin: '请执行 brew install ffmpeg 后重启应用',
    linux: '请用系统包管理器安装 ffmpeg 后重启应用',
    default: '请自行安装 ffmpeg 并确保它在 PATH 中',
  },
  ollama: {
    darwin: '请从 ollama.com/download 下载 macOS 版本后重启应用',
    linux: '请参考 ollama.com/download 的 Linux 安装说明后重启应用',
    default: '请从 ollama.com/download 安装后重启应用',
  },
};

export function isAutoInstallSupported(
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === 'win32';
}

export function getRuntimeInstallSupport(
  target: RuntimeInstallTarget,
  platform: NodeJS.Platform = process.platform,
): RuntimeInstallSupport {
  const hints = MANUAL_HINTS[target];
  return {
    supported: isAutoInstallSupported(platform),
    manualHint: hints[platform] ?? hints.default,
  };
}

export function getRuntimeInstallSupportSummary(
  platform: NodeJS.Platform = process.platform,
): RuntimeInstallSupportSummary {
  return {
    platform,
    whisper: getRuntimeInstallSupport('whisper', platform),
    ffmpeg: getRuntimeInstallSupport('ffmpeg', platform),
    ollama: getRuntimeInstallSupport('ollama', platform),
  };
}

/** 安装流程入口统一用它兜底，保证错误文案和界面提示一致。 */
export function assertAutoInstallSupported(target: RuntimeInstallTarget): void {
  if (isAutoInstallSupported()) return;
  const { manualHint } = getRuntimeInstallSupport(target);
  throw new Error(
    `当前平台（${process.platform}）暂不支持自动安装：${manualHint}`,
  );
}
