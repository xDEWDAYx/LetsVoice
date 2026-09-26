import { CloseAction } from '@shared/types/BackgroundTypes';
import {
  FontSizeSetting,
  LanguageSetting,
  ThemeSetting,
} from '../../settings/SettingsController';

/**
 * 选项只保留取值与 i18n key，可读文案由面板通过 t() 渲染，
 * 以便随界面语言切换而更新。
 */
export const FONT_SIZE_OPTIONS: Array<{
  value: FontSizeSetting;
  labelKey: string;
  descKey: string;
  sample: string;
}> = [
  {
    value: 'small',
    labelKey: 'settings.font.small',
    descKey: 'settings.font.small.desc',
    sample: 'Aa',
  },
  {
    value: 'medium',
    labelKey: 'settings.font.medium',
    descKey: 'settings.font.medium.desc',
    sample: 'Aa',
  },
  {
    value: 'large',
    labelKey: 'settings.font.large',
    descKey: 'settings.font.large.desc',
    sample: 'Aa',
  },
];

export const THEME_OPTIONS: Array<{
  value: ThemeSetting;
  labelKey: string;
  descKey: string;
}> = [
  {
    value: 'light',
    labelKey: 'settings.theme.light',
    descKey: 'settings.theme.light.desc',
  },
  {
    value: 'dark',
    labelKey: 'settings.theme.dark',
    descKey: 'settings.theme.dark.desc',
  },
  {
    value: 'system',
    labelKey: 'settings.theme.system',
    descKey: 'settings.theme.system.desc',
  },
];

export const AGENT_AUTO_SPEAK_OPTIONS: Array<{
  value: boolean;
  labelKey: string;
  descKey: string;
  glyph: string;
}> = [
  {
    value: true,
    labelKey: 'settings.agent.autoSpeak.on',
    descKey: 'settings.agent.autoSpeak.on.desc',
    glyph: '♪',
  },
  {
    value: false,
    labelKey: 'settings.agent.autoSpeak.off',
    descKey: 'settings.agent.autoSpeak.off.desc',
    glyph: '✕',
  },
];

export const LANGUAGE_OPTIONS: Array<{
  value: LanguageSetting;
  labelKey: string;
  descKey: string;
  glyph: string;
}> = [
  {
    value: 'zh',
    labelKey: 'settings.language.zh',
    descKey: 'settings.language.zh.desc',
    glyph: '中',
  },
  {
    value: 'en',
    labelKey: 'settings.language.en',
    descKey: 'settings.language.en.desc',
    glyph: 'EN',
  },
];

/** 关闭主窗口时的行为。默认「每次询问」，勾一次「记住」就不再打扰。 */
export const CLOSE_ACTION_OPTIONS: Array<{
  value: CloseAction;
  labelKey: string;
  descKey: string;
  glyph: string;
}> = [
  {
    value: 'ask',
    labelKey: 'settings.background.close.ask',
    descKey: 'settings.background.close.ask.desc',
    glyph: '?',
  },
  {
    value: 'tray',
    labelKey: 'settings.background.close.tray',
    descKey: 'settings.background.close.tray.desc',
    glyph: '▼',
  },
  {
    value: 'quit',
    labelKey: 'settings.background.close.quit',
    descKey: 'settings.background.close.quit.desc',
    glyph: '⏻',
  },
];

/**
 * 设置页左边的分类。
 *
 * 放在这个纯模块里，是因为 id 不只是页面内部的事：它同时是地址栏
 * ?section= 的取值，新手引导靠它把人直接送进某一栏。写在页面组件里的话，
 * 想校验「引导指的那一栏真的存在」就得把整个设置页（连同七个面板和 CSS）
 * 一起拖进测试。
 */
export type SettingsCategoryId =
  | 'appearance'
  | 'language'
  | 'agent'
  | 'background'
  | 'hardware'
  | 'trash'
  | 'guide';

export const SETTINGS_CATEGORIES: Array<{
  id: SettingsCategoryId;
  labelKey: string;
  descKey: string;
  glyph: string;
}> = [
  {
    id: 'appearance',
    labelKey: 'settings.category.appearance',
    descKey: 'settings.category.appearance.desc',
    glyph: '◐',
  },
  {
    id: 'language',
    labelKey: 'settings.category.language',
    descKey: 'settings.category.language.desc',
    glyph: '文',
  },
  {
    id: 'agent',
    labelKey: 'settings.category.agent',
    descKey: 'settings.category.agent.desc',
    glyph: '✦',
  },
  {
    id: 'background',
    labelKey: 'settings.category.background',
    descKey: 'settings.category.background.desc',
    glyph: '⌂',
  },
  {
    id: 'hardware',
    labelKey: 'settings.category.hardware',
    descKey: 'settings.category.hardware.desc',
    glyph: '▣',
  },
  {
    id: 'trash',
    labelKey: 'settings.category.trash',
    descKey: 'settings.category.trash.desc',
    glyph: '♲',
  },
  {
    id: 'guide',
    labelKey: 'settings.category.guide',
    descKey: 'settings.category.guide.desc',
    glyph: '?',
  },
];

export function isSettingsCategoryId(
  value: string | null | undefined,
): value is SettingsCategoryId {
  return SETTINGS_CATEGORIES.some((category) => category.id === value);
}
