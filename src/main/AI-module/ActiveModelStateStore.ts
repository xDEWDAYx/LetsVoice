import fs from 'fs';
import path from 'path';

type ActiveModelState = {
  activeModelId: string | null;
};

/** 在 userData 中保存某一类模型的当前激活 ID。 */
export default class ActiveModelStateStore {
  private readonly statePath: string;

  public constructor(statePath: string) {
    this.statePath = statePath;
  }

  public getActiveModelId(): string | null {
    try {
      const state = JSON.parse(
        fs.readFileSync(this.statePath, 'utf8'),
      ) as Partial<ActiveModelState>;
      return typeof state.activeModelId === 'string'
        ? state.activeModelId
        : null;
    } catch {
      return null;
    }
  }

  /**
   * 给出当前真正该激活的模型 ID：已保存的那个仍在已下载列表里就沿用，
   * 否则挑第一个已下载的模型并落盘。
   *
   * 下载完却没人手动点一下「选中」时，功能就应该直接可用——
   * 否则模型明明躺在硬盘上，开工前检查还在报「未选择模型」。
   *
   * downloadedIds 为空时不动已保存的值：Ollama 没起来时拿到的就是空列表，
   * 这种「查不到」不能被当成「用户把模型删了」而清掉他的选择。
   */
  public resolveActiveModelId(downloadedIds: readonly string[]): string | null {
    const stored = this.getActiveModelId();
    if (stored !== null && downloadedIds.includes(stored)) return stored;
    if (downloadedIds.length === 0) return stored;

    const [firstDownloaded] = downloadedIds;
    this.setActiveModelId(firstDownloaded);
    return firstDownloaded;
  }

  public setActiveModelId(activeModelId: string | null): void {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(
      this.statePath,
      `${JSON.stringify({ activeModelId }, null, 2)}\n`,
      'utf8',
    );
  }
}
