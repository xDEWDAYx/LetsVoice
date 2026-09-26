import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AppSettings } from '../../settings/SettingsController';
import { useAppSettings } from '../../settings/AppSettingsProvider';
import AgentSettingsPanel from './components/AgentSettingsPanel';
import BackgroundSettingsPanel from './components/BackgroundSettingsPanel';
import FontSizeSettingsPanel from './components/FontSizeSettingsPanel';
import HardwareSettingsPanel from './components/HardwareSettingsPanel';
import LanguageSettingsPanel from './components/LanguageSettingsPanel';
import OnboardingSettingsPanel from './components/OnboardingSettingsPanel';
import ThemeSettingsPanel from './components/ThemeSettingsPanel';
import TrashSettingsPanel from './components/TrashSettingsPanel';
import {
  isSettingsCategoryId,
  SETTINGS_CATEGORIES,
  SettingsCategoryId,
} from './SettingsOptions';
import './SettingsPage.css';

/**
 * 设置主页面：左侧分类导航 + 右侧对应内容面板，加载/保存状态集中管理。
 *
 * 打开哪一类记在地址栏的 ?section= 上。这样别处才能直接把人送到具体某一栏，
 * 而不是只能把他扔在「外观」那一页、再让他自己找 —— 新手引导讲后台常驻和
 * 全局快捷键时指的就是面板里的控件，控件得先在页面上。
 */
export default function SettingsPage() {
  const { t } = useTranslation();
  const { settings, resolvedTheme, loading, loadError, updateSettings } =
    useAppSettings();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [trashCount, setTrashCount] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCategory = searchParams.get('section');
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(
    () =>
      isSettingsCategoryId(requestedCategory)
        ? requestedCategory
        : 'appearance',
  );

  // 地址栏变了就跟着切（引导正是靠这个把人带进某一栏）
  useEffect(() => {
    if (isSettingsCategoryId(requestedCategory)) {
      setActiveCategory(requestedCategory);
    }
  }, [requestedCategory]);

  useEffect(() => {
    let cancelled = false;
    window.electron.trash
      .count()
      .then((count) => {
        if (!cancelled) setTrashCount(Number(count));
        return null;
      })
      .catch(() => {
        if (!cancelled) setTrashCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let statusText = t('settings.status.synced');
  if (loading) statusText = t('settings.status.loading');
  else if (saving) statusText = t('settings.status.saving');

  const save = async (nextSettings: AppSettings) => {
    setSaving(true);
    setSaveError('');
    try {
      await updateSettings(nextSettings);
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : t('settings.error.save'),
      );
    } finally {
      setSaving(false);
    }
  };

  const disabled = loading || saving;

  return (
    <section className="settings-page">
      <header className="settings-header">
        <div>
          <span className="settings-eyebrow">SETTINGS</span>
          <h1>{t('settings.title')}</h1>
          <p>{t('settings.subtitle')}</p>
        </div>
        <div className="settings-status" aria-live="polite">
          <span
            className={`settings-status-dot${saving ? ' is-saving' : ''}`}
          />
          {statusText}
        </div>
      </header>

      {(loadError || saveError) && (
        <p className="settings-error" role="alert">
          {saveError || loadError}
        </p>
      )}

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t('settings.title')}>
          {SETTINGS_CATEGORIES.map((category) => (
            <button
              type="button"
              key={category.id}
              className={`settings-nav-item${
                activeCategory === category.id ? ' is-active' : ''
              }`}
              aria-current={activeCategory === category.id}
              onClick={() => {
                setActiveCategory(category.id);
                // 同步到地址栏，刷新或分享链接都还停在这一栏。
                // replace 是为了别把「点了七个分类」塞满后退历史。
                setSearchParams({ section: category.id }, { replace: true });
              }}
              // 手把手引导按分类 id 定位到具体某一项（见 OnboardingSteps.ts）
              data-tour={`settings-${category.id}`}
            >
              <span className="settings-nav-glyph" aria-hidden="true">
                {category.glyph}
              </span>
              <span className="settings-nav-copy">
                <strong>
                  <span>{t(category.labelKey)}</span>
                  {category.id === 'trash' && trashCount > 0 && (
                    <span
                      aria-label={t('trash.badge.label', { count: trashCount })}
                      className="settings-nav-badge"
                    >
                      {trashCount > 99 ? '99+' : trashCount}
                    </span>
                  )}
                </strong>
                <small>{t(category.descKey)}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {activeCategory === 'appearance' && (
            <>
              <ThemeSettingsPanel
                disabled={disabled}
                resolvedTheme={resolvedTheme}
                save={save}
                settings={settings}
              />
              <FontSizeSettingsPanel
                disabled={disabled}
                save={save}
                settings={settings}
              />
            </>
          )}

          {activeCategory === 'language' && (
            <LanguageSettingsPanel
              disabled={disabled}
              save={save}
              settings={settings}
            />
          )}

          {activeCategory === 'background' && (
            <BackgroundSettingsPanel
              disabled={disabled}
              save={save}
              settings={settings}
            />
          )}

          {activeCategory === 'agent' && (
            <AgentSettingsPanel
              disabled={disabled}
              save={save}
              settings={settings}
            />
          )}

          {activeCategory === 'hardware' && <HardwareSettingsPanel />}

          {activeCategory === 'trash' && (
            <TrashSettingsPanel onCountChange={setTrashCount} />
          )}

          {activeCategory === 'guide' && <OnboardingSettingsPanel />}
        </div>
      </div>
    </section>
  );
}
