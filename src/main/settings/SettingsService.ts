import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { isValidAccelerator } from '@shared/shortcuts/Accelerator';
import {
  BackgroundSettings,
  CLOSE_ACTIONS,
  CloseAction,
  DEFAULT_BACKGROUND_SETTINGS,
  ShortcutBindings,
  SHORTCUT_ACTIONS,
} from '@shared/types/BackgroundTypes';

export type FontSizeSetting = 'small' | 'medium' | 'large';
export type ThemeSetting = 'light' | 'dark' | 'system';
export type LanguageSetting = 'zh' | 'en';

export type AppSettings = {
  fontSize: FontSizeSetting;
  theme: ThemeSetting;
  language: LanguageSetting;
  /** 智能助理答完是否自动朗读；TTS 未就绪时静默跳过，不报错。 */
  agentAutoSpeak: boolean;
  /** 托盘常驻与全局快捷键。 */
  background: BackgroundSettings;
};

const DEFAULT_APPEARANCE = {
  fontSize: 'medium' as FontSizeSetting,
  theme: 'system' as ThemeSetting,
};

const DEFAULT_AGENT_AUTO_SPEAK = true;

/**
 * 根据操作系统语言推断默认界面语言：中文区域用中文，其余一律英文。
 * 仅用于首次运行 / 旧配置缺省语言字段的兜底，用户手动选择后不再参与。
 */
function detectSystemLanguage(): LanguageSetting {
  let locale = '';
  try {
    // app.getLocale 需在 app ready 后可用；异常时安全回退。
    locale = app.getLocale();
  } catch {
    locale = '';
  }
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/**
 * 后台设置的兜底与清洗。
 *
 * 这是后加的一整块，老配置里没有；而且快捷键是用户手输的字符串，
 * 非法值不能让整份设置作废——按字段逐个回落到默认值即可。
 */
function normalizeBackground(value: unknown): BackgroundSettings {
  const candidate = (value ?? {}) as Partial<BackgroundSettings>;
  const defaults = DEFAULT_BACKGROUND_SETTINGS;

  const closeAction: CloseAction =
    candidate.closeAction && CLOSE_ACTIONS.includes(candidate.closeAction)
      ? candidate.closeAction
      : defaults.closeAction;

  const trayEnabled =
    typeof candidate.trayEnabled === 'boolean'
      ? candidate.trayEnabled
      : defaults.trayEnabled;

  const rawShortcuts = (candidate.shortcuts ?? {}) as Partial<ShortcutBindings>;
  const shortcuts = SHORTCUT_ACTIONS.reduce((acc, action) => {
    const accelerator = rawShortcuts[action];
    // 显式的 null 表示「用户特意不绑」，要保留；undefined 才回落到默认值
    if (accelerator === null) {
      acc[action] = null;
    } else if (isValidAccelerator(accelerator)) {
      acc[action] = accelerator;
    } else if (accelerator === undefined) {
      acc[action] = defaults.shortcuts[action];
    } else {
      acc[action] = null;
    }
    return acc;
  }, {} as ShortcutBindings);

  return { closeAction, trayEnabled, shortcuts };
}

function buildDefaultSettings(): AppSettings {
  return {
    ...DEFAULT_APPEARANCE,
    language: detectSystemLanguage(),
    agentAutoSpeak: DEFAULT_AGENT_AUTO_SPEAK,
    background: normalizeBackground(undefined),
  };
}

/**
 * 通用应用设置服务：负责验证并持久化设置，不包含页面展示逻辑。
 * 文件保存在 Electron userData 目录，应用升级时仍会保留。
 */
export class SettingsService {
  private readonly settingsPath: string;

  public constructor(
    settingsPath = path.join(app.getPath('userData'), 'app-settings.json'),
  ) {
    this.settingsPath = settingsPath;
  }

  public getSettings(): AppSettings {
    if (!fs.existsSync(this.settingsPath)) {
      // 首次运行：按设备系统语言给出默认界面语言。
      return buildDefaultSettings();
    }

    try {
      const storedValue = JSON.parse(
        fs.readFileSync(this.settingsPath, 'utf8'),
      ) as unknown;
      return SettingsService.normalizeSettings(storedValue);
    } catch {
      // 文件损坏或无法读取时使用安全默认值，避免阻止应用启动。
      return buildDefaultSettings();
    }
  }

  public updateSettings(rawSettings: unknown): AppSettings {
    const settings = SettingsService.normalizeSettings(rawSettings);
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    fs.writeFileSync(
      this.settingsPath,
      `${JSON.stringify(settings, null, 2)}\n`,
      'utf8',
    );
    return settings;
  }

  private static normalizeSettings(value: unknown): AppSettings {
    if (typeof value !== 'object' || value === null) {
      throw new Error('无效的应用设置 / Invalid application settings');
    }

    const candidate = value as Partial<AppSettings>;
    const fontSizes: FontSizeSetting[] = ['small', 'medium', 'large'];
    const themes: ThemeSetting[] = ['light', 'dark', 'system'];
    const languages: LanguageSetting[] = ['zh', 'en'];

    if (!candidate.fontSize || !fontSizes.includes(candidate.fontSize)) {
      throw new Error('无效的字号设置 / Invalid font size setting');
    }
    if (!candidate.theme || !themes.includes(candidate.theme)) {
      throw new Error('无效的主题设置 / Invalid theme setting');
    }
    // 语言字段为后续新增：已保存的合法值优先使用（尊重用户手动选择），
    // 旧配置缺省时按系统语言兜底，保证向后兼容。
    const language =
      candidate.language && languages.includes(candidate.language)
        ? candidate.language
        : detectSystemLanguage();

    // 同样是后续新增字段：旧配置里没有时用默认值，不能因此判定整份设置无效。
    const agentAutoSpeak =
      typeof candidate.agentAutoSpeak === 'boolean'
        ? candidate.agentAutoSpeak
        : DEFAULT_AGENT_AUTO_SPEAK;

    return {
      fontSize: candidate.fontSize,
      theme: candidate.theme,
      language,
      agentAutoSpeak,
      background: normalizeBackground(candidate.background),
    };
  }
}
