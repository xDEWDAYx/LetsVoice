import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  acceleratorFromChord,
  formatAccelerator,
} from '@shared/shortcuts/Accelerator';
import { ShortcutState } from '@shared/types/BackgroundTypes';

type Props = {
  label: string;
  description: string;
  accelerator: string | null;
  /** 主进程给出的实际注册结果，冲突/失效都要让用户看见。 */
  state: ShortcutState;
  disabled: boolean;
  onChange(accelerator: string | null): void;
};

/**
 * 录制一个全局快捷键。
 *
 * 点一下进入录制态，直接按组合键即可；Esc 取消，Backspace/Delete 解绑。
 * 录制时阻止默认行为，否则 Ctrl+F 之类会先被浏览器/应用自己吃掉。
 */
export default function ShortcutRecorder({
  label,
  description,
  accelerator,
  state,
  disabled,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // 退出录制态时把焦点还回按钮，键盘用户不会丢失位置
  useEffect(() => {
    if (!recording) return;
    buttonRef.current?.focus();
  }, [recording]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      setRecording(false);
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      onChange(null);
      setRecording(false);
      return;
    }

    const next = acceleratorFromChord({
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      key: event.key,
    });
    // 只按下修饰键时 next 是 null：继续等用户按主键，不要退出录制
    if (!next) return;

    onChange(next);
    setRecording(false);
  };

  const stateKey = `settings.background.shortcut.state.${state}`;
  const shown = accelerator
    ? formatAccelerator(accelerator, window.navigator.platform)
    : t('settings.background.shortcut.unset');

  return (
    <div className="settings-shortcut-row">
      <div className="settings-shortcut-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </div>

      <div className="settings-shortcut-controls">
        <button
          type="button"
          ref={buttonRef}
          className={`settings-shortcut-key${recording ? ' is-recording' : ''}`}
          disabled={disabled}
          aria-label={t('settings.background.shortcut.record', { name: label })}
          onClick={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={handleKeyDown}
        >
          {recording ? t('settings.background.shortcut.listening') : shown}
        </button>

        {accelerator && !recording && (
          <button
            type="button"
            className="settings-shortcut-clear"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            {t('settings.background.shortcut.clear')}
          </button>
        )}

        <span
          className={`settings-shortcut-state is-${state}`}
          // 冲突要看得见：register() 失败是静默的，不说用户只会以为坏了
          role={
            state === 'conflict' || state === 'invalid' ? 'alert' : undefined
          }
        >
          {t(stateKey)}
        </span>
      </div>
    </div>
  );
}
