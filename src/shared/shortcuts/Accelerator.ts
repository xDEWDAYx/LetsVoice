/**
 * 全局快捷键字符串（Electron accelerator）的解析、校验与展示。
 *
 * 设置页要把用户按下的按键变成 accelerator，主进程要拿它去注册，
 * 两边必须是同一套规则，所以放在 shared 里，并且写成纯函数好单测。
 */
import { ShortcutAction, ShortcutBindings } from '../types/BackgroundTypes';

/** Electron 认的修饰键写法，顺序固定，保证同一组合只有一种字符串。 */
const MODIFIER_ORDER = ['CommandOrControl', 'Alt', 'Shift', 'Super'] as const;

/** 允许单独作为主键的功能键。 */
const FUNCTION_KEYS = Array.from({ length: 24 }, (_, i) => `F${i + 1}`);

const NAMED_KEYS = [
  'Space',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Return',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Escape',
  'Plus',
  'PrintScreen',
];

/** 浏览器 KeyboardEvent.key 到 accelerator 主键名的映射。 */
const KEY_ALIASES: Record<string, string> = {
  ' ': 'Space',
  spacebar: 'Space',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  enter: 'Return',
  esc: 'Escape',
  escape: 'Escape',
  del: 'Delete',
  '+': 'Plus',
};

const MODIFIER_KEY_NAMES = new Set([
  'control',
  'ctrl',
  'alt',
  'altgraph',
  'shift',
  'meta',
  'os',
  'hyper',
  'super',
]);

function normalizeMainKey(rawKey: string): string | null {
  // 空格键的 KeyboardEvent.key 就是 ' '，trim 之前先认出来
  if (rawKey === ' ') return 'Space';

  const key = rawKey.trim();
  if (key === '') return null;

  const lower = key.toLowerCase();
  if (MODIFIER_KEY_NAMES.has(lower)) return null;
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];

  // 单个字母 / 数字：统一大写，A 和 a 是同一个键
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase();

  const named = [...FUNCTION_KEYS, ...NAMED_KEYS].find(
    (candidate) => candidate.toLowerCase() === lower,
  );
  if (named) return named;

  // 标点等可打印字符原样保留（Electron 支持 - = [ ] ; ' , . / \ ` 等）
  if (key.length === 1) return key;
  return null;
}

export type KeyChord = {
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  key: string;
};

/**
 * 把一次按键变成 accelerator。
 *
 * Ctrl 和 Cmd 统一写成 CommandOrControl：用户在 Windows 上按 Ctrl、
 * 在 macOS 上按 Cmd，存的是同一个字符串，换平台也不用重设。
 * 只按修饰键、或者没有任何修饰键时返回 null——全局快捷键不带修饰键
 * 会把普通打字也吃掉。
 */
export function acceleratorFromChord(chord: KeyChord): string | null {
  const mainKey = normalizeMainKey(chord.key);
  if (!mainKey) return null;

  const modifiers: string[] = [];
  if (chord.ctrlKey || chord.metaKey) modifiers.push('CommandOrControl');
  if (chord.altKey) modifiers.push('Alt');
  if (chord.shiftKey) modifiers.push('Shift');

  // 功能键可以单独使用，其它主键必须配修饰键
  const isFunctionKey = FUNCTION_KEYS.includes(mainKey);
  if (modifiers.length === 0 && !isFunctionKey) return null;

  const ordered = MODIFIER_ORDER.filter((modifier) =>
    modifiers.includes(modifier),
  );
  return [...ordered, mainKey].join('+');
}

/** 字符串是否是我们认可的 accelerator（注册前先自查，别把垃圾丢给系统）。 */
export function isValidAccelerator(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  const parts = value.split('+');
  const mainKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  if (!normalizeMainKey(mainKey)) return false;
  if (modifiers.some((modifier) => !MODIFIER_ORDER.includes(modifier as never)))
    return false;
  // 修饰键不能重复
  if (new Set(modifiers).size !== modifiers.length) return false;
  if (modifiers.length === 0 && !FUNCTION_KEYS.includes(mainKey)) return false;
  return true;
}

/** 界面上显示的写法：Windows/Linux 用 Ctrl，macOS 用符号。 */
export function formatAccelerator(
  accelerator: string,
  platform: string = 'win32',
): string {
  const isMac = platform === 'darwin';
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'CommandOrControl') return isMac ? '⌘' : 'Ctrl';
      if (part === 'Alt') return isMac ? '⌥' : 'Alt';
      if (part === 'Shift') return isMac ? '⇧' : 'Shift';
      if (part === 'Super') return isMac ? '⌃' : 'Win';
      return part;
    })
    .join(isMac ? '' : '+');
}

/**
 * 找出被重复绑定的动作。
 *
 * 同一个组合绑两个动作时，系统只会把它交给先注册的那个，
 * 与其让用户猜哪个生效，不如在设置页就标出来。
 */
export function findDuplicateActions(
  bindings: ShortcutBindings,
): ShortcutAction[] {
  const seen = new Map<string, ShortcutAction[]>();
  (Object.keys(bindings) as ShortcutAction[]).forEach((action) => {
    const accelerator = bindings[action];
    if (!accelerator) return;
    const group = seen.get(accelerator) ?? [];
    group.push(action);
    seen.set(accelerator, group);
  });

  const duplicates: ShortcutAction[] = [];
  seen.forEach((actions) => {
    if (actions.length > 1) duplicates.push(...actions);
  });
  return duplicates;
}
