import { assertAutoInstallSupported } from '../runtime/RuntimeInstallSupport';

const LATEST_RELEASE_API =
  'https://api.github.com/repos/ollama/ollama/releases/latest';

type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
  digest?: string | null;
};

type GitHubRelease = {
  tag_name?: string;
  assets?: GitHubReleaseAsset[];
};

export type OllamaReleaseInfo = {
  source: string;
  tag: string | null;
  assetName: string;
  downloadUrl: string;
  digest: string | null;
  sha256: string | null;
};

/** 从官方 release 动态选择 Windows 便携包，避免把版本号写死。 */
export default class OllamaReleaseClient {
  public static async getLatest(
    signal?: AbortSignal,
  ): Promise<OllamaReleaseInfo> {
    const assetName = OllamaReleaseClient.getAssetName();
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
      throw new Error(`官方 release 缺少资源 / Missing asset: ${assetName}`);
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
    assertAutoInstallSupported('ollama');
    if (process.arch === 'x64') return 'ollama-windows-amd64.zip';
    if (process.arch === 'arm64') return 'ollama-windows-arm64.zip';
    throw new Error(`暂不支持的 Windows 架构: ${process.arch}`);
  }
}
