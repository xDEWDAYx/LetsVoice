import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_BACKGROUND_SETTINGS } from '@shared/types/BackgroundTypes';
import { SettingsService } from '../main/settings/SettingsService';

/** 每个用例一份临时设置文件，互不干扰。 */
function makeService(initial?: unknown) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speakspace-settings-'));
  const file = path.join(dir, 'app-settings.json');
  if (initial !== undefined) {
    fs.writeFileSync(file, JSON.stringify(initial), 'utf8');
  }
  return new SettingsService(file);
}

const base = {
  fontSize: 'medium',
  theme: 'dark',
  language: 'zh',
  agentAutoSpeak: true,
};

describe('后台设置的读写', () => {
  it('老配置里没有 background 时补上默认值，而不是判定整份设置无效', () => {
    const settings = makeService(base).getSettings();

    expect(settings.background).toEqual(DEFAULT_BACKGROUND_SETTINGS);
  });

  it('保留用户存下的合法配置', () => {
    const settings = makeService({
      ...base,
      background: {
        closeAction: 'tray',
        trayEnabled: false,
        shortcuts: {
          dashboardHud: 'Alt+Shift+D',
          todoHud: null,
          quickRecord: 'F9',
        },
      },
    }).getSettings();

    expect(settings.background.closeAction).toBe('tray');
    expect(settings.background.trayEnabled).toBe(false);
    expect(settings.background.shortcuts).toEqual({
      dashboardHud: 'Alt+Shift+D',
      todoHud: null,
      quickRecord: 'F9',
    });
  });

  it('null 表示用户特意解绑，不能被默认值盖回去', () => {
    const settings = makeService({
      ...base,
      background: { shortcuts: { dashboardHud: null } },
    }).getSettings();

    expect(settings.background.shortcuts.dashboardHud).toBeNull();
    // 没提到的键仍然回落到默认
    expect(settings.background.shortcuts.todoHud).toBe(
      DEFAULT_BACKGROUND_SETTINGS.shortcuts.todoHud,
    );
  });

  it('非法的快捷键字符串当作未绑定，不让整份设置作废', () => {
    const settings = makeService({
      ...base,
      background: { shortcuts: { dashboardHud: 'Ctrl+', todoHud: 42 } },
    }).getSettings();

    expect(settings.background.shortcuts.dashboardHud).toBeNull();
    expect(settings.background.shortcuts.todoHud).toBeNull();
  });

  it('无效的关窗行为回落到默认', () => {
    const settings = makeService({
      ...base,
      background: { closeAction: 'explode' },
    }).getSettings();

    expect(settings.background.closeAction).toBe(
      DEFAULT_BACKGROUND_SETTINGS.closeAction,
    );
  });

  it('保存后能原样读回来', () => {
    const service = makeService(base);
    const saved = service.updateSettings({
      ...base,
      background: {
        closeAction: 'quit',
        trayEnabled: true,
        shortcuts: {
          dashboardHud: 'CommandOrControl+Alt+G',
          todoHud: null,
          quickRecord: null,
        },
      },
    });

    expect(service.getSettings().background).toEqual(saved.background);
  });
});
