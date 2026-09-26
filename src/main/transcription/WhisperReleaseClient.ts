import { assertAutoInstallSupported } from '../runtime/RuntimeInstallSupport';

const LATEST_RELEASE_API =
  'https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest';

type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
  digest?: string | null;
};

type GitHubRelease = {
  tag_name?: string;
  assets?: GitHubReleaseAsset[];
};

export type WhisperReleaseInfo = {
  source: string;
  tag: string | null;
  assetName: string;
  downloadUrl: string;
  digest: string | null;
  sha256: string | null;
};

/** 查询官方 whisper.cpp release，并为当前 Windows 架构选择 CPU 资源。 */
export default class WhisperReleaseClient {
  public static async getLatest(
    signal?: AbortSignal,
  ): Promise<WhisperReleaseInfo> {
    const assetName = WhisperReleaseClient.getAssetName();
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SpeakSpace-Local-Runtime-Installer',
      },
      signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub release 查询失败: ${response.status}`);
    }

    const release = (await response.json()) as GitHubRelease;
    const asset = release.assets?.find((item) => item.name === assetName);
    if (!asset) {
      throw new Error(
        `官方 release 中没有适用资源 / Missing asset: ${assetName}`,
      );
    }

    return {
      source: LATEST_RELEASE_API,
      tag: release.tag_name ?? null,
      assetName: asset.name,
      downloadUrl: asset.browser_download_url,
      digest: asset.digest ?? null,
      sha256: asset.digest?.startsWith('sha256:')
        ? asset.digest.slice(7)
        : null,
    };
  }

  private static getAssetName(): string {
    assertAutoInstallSupported('whisper');
    if (process.arch === 'x64') return 'whisper-bin-x64.zip';
    if (process.arch === 'ia32') return 'whisper-bin-Win32.zip';
    throw new Error(
      `暂不支持的 Windows 架构 / Unsupported arch: ${process.arch}`,
    );
  }
}
