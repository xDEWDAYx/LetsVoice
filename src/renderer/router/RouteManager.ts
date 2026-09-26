import { NavigateFunction, NavigateOptions } from 'react-router-dom';

export enum RoutePath {
  Transcription = '/Transcription',
  AIChat = '/AIChat',
  Workspace = '/Workspace',
  ModelManagement = '/ModelManagement',
  Dashboard = '/DashBoard',
  Settings = '/Settings',
}

/**
 * RouteManager provides an OOP service layer over React Router navigation,
 * eliminating repeated route string literals and centralizing page transition behavior (DRY principle).
 */
export class RouteManager {
  private navigator: NavigateFunction;

  private originPath?: string;

  /**
   * originPath 是「当前页面的路径」。给了它，之后每次跳转都会把来源写进
   * history state 的 from 字段，详情页的返回按钮据此回到出发地
   * （见 BackNavigation）。不给就是原来的行为，不带来源。
   */
  public constructor(navigator: NavigateFunction, originPath?: string) {
    this.navigator = navigator;
    this.originPath = originPath;
  }

  /** 在调用方自己的 state 上补一个 from，不覆盖已有字段。 */
  private withOrigin(options?: NavigateOptions): NavigateOptions | undefined {
    if (!this.originPath) return options;
    const state = (options?.state ?? {}) as Record<string, unknown>;
    return { ...options, state: { from: this.originPath, ...state } };
  }

  public navigateTo(path: RoutePath, options?: NavigateOptions): void {
    this.navigator(path, this.withOrigin(options));
  }

  public navigateToSettings(options?: NavigateOptions): void {
    this.navigator(RoutePath.Settings, this.withOrigin(options));
  }

  public navigateToDashboard(options?: NavigateOptions): void {
    this.navigator(RoutePath.Dashboard, this.withOrigin(options));
  }

  public navigateToWorkspace(
    workspaceId: number,
    options?: NavigateOptions,
  ): void {
    this.navigator(
      `${RoutePath.Workspace}/${workspaceId}`,
      this.withOrigin(options),
    );
  }

  public navigateToTranscription(options?: NavigateOptions): void {
    this.navigator(RoutePath.Transcription, this.withOrigin(options));
  }
}
