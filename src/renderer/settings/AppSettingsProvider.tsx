import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DEFAULT_BACKGROUND_SETTINGS } from '@shared/types/BackgroundTypes';
import i18n from '../../i18n';
import { AppSettings, SettingsController } from './SettingsController';

type SettingsContextValue = {
  settings: AppSettings;
  resolvedTheme: 'light' | 'dark';
  loading: boolean;
  loadError: string;
  updateSettings(nextSettings: AppSettings): Promise<void>;
};

const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 'medium',
  theme: 'system',
  language: 'zh',
  agentAutoSpeak: true,
  background: DEFAULT_BACKGROUND_SETTINGS,
};

const SettingsContext = createContext<SettingsContextValue | null>(null);
const settingsController = new SettingsController();

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const mediaQuery = useMemo(
    () => window.matchMedia('(prefers-color-scheme: dark)'),
    [],
  );
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [systemUsesDarkTheme, setSystemUsesDarkTheme] = useState(
    mediaQuery.matches,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setSystemUsesDarkTheme(event.matches);
    };
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () =>
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [mediaQuery]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setSettings(await settingsController.getSettings());
      } catch (reason) {
        setLoadError(
          reason instanceof Error ? reason.message : '读取应用设置失败',
        );
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const resolvedTheme = SettingsController.resolveTheme(
    settings.theme,
    systemUsesDarkTheme,
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.fontSize = settings.fontSize;
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = settings.theme;
  }, [resolvedTheme, settings.fontSize, settings.theme]);

  // 明暗切换时给全局挂一层短暂的颜色过渡（见 AppSettings.css）。
  // 只在切换那一下开启：常驻的全局 transition 会拖慢所有交互，
  // 也会和各组件自己的 hover 过渡互相打架。
  const previousTheme = useRef(resolvedTheme);
  useEffect(() => {
    if (previousTheme.current === resolvedTheme) return undefined;
    previousTheme.current = resolvedTheme;

    const root = document.documentElement;
    root.classList.add('theme-transition');
    const timer = window.setTimeout(
      () => root.classList.remove('theme-transition'),
      450,
    );
    return () => {
      window.clearTimeout(timer);
      root.classList.remove('theme-transition');
    };
  }, [resolvedTheme]);

  // 语言设置变化时同步 i18next，并反映到 <html lang> 便于无障碍与样式。
  useEffect(() => {
    if (i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language);
    }
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  const contextValue = useMemo<SettingsContextValue>(
    () => ({
      settings,
      resolvedTheme,
      loading,
      loadError,
      async updateSettings(nextSettings: AppSettings) {
        const savedSettings =
          await settingsController.updateSettings(nextSettings);
        setSettings(savedSettings);
        setLoadError('');
        // 托盘和全局快捷键在主进程里，保存完要让它按新配置重装一遍。
        // 失败不该影响保存本身——设置页会另行显示每个快捷键的状态。
        await window.electron.background?.apply?.().catch(() => undefined);
      },
    }),
    [loadError, loading, resolvedTheme, settings],
  );

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useAppSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useAppSettings must be used inside AppSettingsProvider');
  }
  return context;
}
