import { BackgroundSettings } from '@shared/types/BackgroundTypes';

export type FontSizeSetting = 'small' | 'medium' | 'large';
export type ThemeSetting = 'light' | 'dark' | 'system';
export type LanguageSetting = 'zh' | 'en';

export type AppSettings = {
  fontSize: FontSizeSetting;
  theme: ThemeSetting;
  language: LanguageSetting;
  /** 智能助理答完是否自动朗读 */
  agentAutoSpeak: boolean;
  /** 托盘常驻与全局快捷键 */
  background: BackgroundSettings;
};

type SettingsApi = {
  get(): Promise<AppSettings>;
  update(settings: AppSettings): Promise<AppSettings>;
};

/**
 * Renderer 设置控制器：统一封装 preload 暴露的设置接口。
 * 页面只处理交互，不需要了解 IPC 名称或设置文件位置。
 */
export class SettingsController {
  private readonly api: SettingsApi;

  public constructor(api: SettingsApi = window.electron.settings) {
    this.api = api;
  }

  public getSettings(): Promise<AppSettings> {
    return this.api.get();
  }

  public updateSettings(settings: AppSettings): Promise<AppSettings> {
    return this.api.update(settings);
  }

  public static resolveTheme(
    theme: ThemeSetting,
    systemUsesDarkTheme: boolean,
  ): 'light' | 'dark' {
    if (theme === 'system') {
      return systemUsesDarkTheme ? 'dark' : 'light';
    }
    return theme;
  }
}
