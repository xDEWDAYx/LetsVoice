import {
  acceleratorFromChord,
  findDuplicateActions,
  formatAccelerator,
  isValidAccelerator,
} from '@shared/shortcuts/Accelerator';
import { ShortcutBindings } from '@shared/types/BackgroundTypes';

describe('acceleratorFromChord', () => {
  it('把按键变成 Electron 认的字符串，修饰键顺序固定', () => {
    expect(
      acceleratorFromChord({ ctrlKey: true, altKey: true, key: 'd' }),
    ).toBe('CommandOrControl+Alt+D');
    expect(
      acceleratorFromChord({ shiftKey: true, altKey: true, key: 'R' }),
    ).toBe('Alt+Shift+R');
  });

  it('Ctrl 和 Cmd 都归一成 CommandOrControl，换平台不用重设', () => {
    expect(acceleratorFromChord({ metaKey: true, key: 'k' })).toBe(
      'CommandOrControl+K',
    );
  });

  it('只按修饰键时还没成型，返回 null 继续等主键', () => {
    expect(acceleratorFromChord({ ctrlKey: true, key: 'Control' })).toBeNull();
    expect(acceleratorFromChord({ altKey: true, key: 'Alt' })).toBeNull();
  });

  it('没有修饰键的普通键不能当全局快捷键', () => {
    // 否则打字时按 D 就会触发
    expect(acceleratorFromChord({ key: 'd' })).toBeNull();
  });

  it('功能键可以单独使用', () => {
    expect(acceleratorFromChord({ key: 'F9' })).toBe('F9');
  });

  it('方向键、回车、空格用 Electron 的写法', () => {
    expect(acceleratorFromChord({ ctrlKey: true, key: 'ArrowUp' })).toBe(
      'CommandOrControl+Up',
    );
    expect(acceleratorFromChord({ altKey: true, key: 'Enter' })).toBe(
      'Alt+Return',
    );
    expect(acceleratorFromChord({ ctrlKey: true, key: ' ' })).toBe(
      'CommandOrControl+Space',
    );
  });
});

describe('isValidAccelerator', () => {
  it('认可正常组合', () => {
    expect(isValidAccelerator('CommandOrControl+Alt+D')).toBe(true);
    expect(isValidAccelerator('F5')).toBe(true);
  });

  it('挡掉空值、裸键和不认识的修饰键', () => {
    expect(isValidAccelerator('')).toBe(false);
    expect(isValidAccelerator(null)).toBe(false);
    expect(isValidAccelerator('D')).toBe(false);
    expect(isValidAccelerator('Ctrl+D')).toBe(false);
    expect(isValidAccelerator('Alt+Alt+D')).toBe(false);
  });
});

describe('formatAccelerator', () => {
  it('Windows 上写成 Ctrl+Alt+D', () => {
    expect(formatAccelerator('CommandOrControl+Alt+D', 'win32')).toBe(
      'Ctrl+Alt+D',
    );
  });

  it('macOS 上用符号且不带加号', () => {
    expect(formatAccelerator('CommandOrControl+Alt+D', 'darwin')).toBe('⌘⌥D');
  });
});

describe('findDuplicateActions', () => {
  const bindings = (partial: Partial<ShortcutBindings>): ShortcutBindings => ({
    dashboardHud: null,
    todoHud: null,
    quickRecord: null,
    ...partial,
  });

  it('同一个组合绑了两个动作时两边都算冲突', () => {
    expect(
      findDuplicateActions(
        bindings({ dashboardHud: 'Alt+D', todoHud: 'Alt+D' }),
      ).sort(),
    ).toEqual(['dashboardHud', 'todoHud']);
  });

  it('没绑的动作不算重复', () => {
    expect(findDuplicateActions(bindings({ dashboardHud: 'Alt+D' }))).toEqual(
      [],
    );
  });
});
