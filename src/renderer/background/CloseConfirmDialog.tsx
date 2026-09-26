import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './CloseConfirmDialog.css';

type Choice = 'tray' | 'quit' | 'cancel';

/**
 * 「关窗后要怎么处理」的应用内弹窗。
 *
 * 原来用的是 Electron 的系统消息框，长得和整个应用格格不入。
 * 现在由主进程发请求、这里用自己的样式来问，选择再回传给主进程执行。
 *
 * 挂在应用最外层：关窗随时可能发生，用户当时停在哪一页都要问得出来。
 */
export default function CloseConfirmDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const api = window.electron.background;
    if (!api?.onRequest) return undefined;

    const dispose = api.onRequest((raw: unknown) => {
      const request = raw as { type?: string };
      if (request?.type !== 'confirmClose') return;
      // 每次都从「不记住」开始：上次勾没勾不该影响这次
      setRemember(false);
      setOpen(true);
    });
    return () => {
      dispose();
    };
  }, []);

  // 打开时把焦点放到默认按钮上，键盘直接回车就能选
  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open]);

  const choose = (choice: Choice) => {
    setOpen(false);
    window.electron.background?.resolveClose?.(choice, remember);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      // Esc 等于取消：不关窗、不改设置
      if (event.key === 'Escape') choose('cancel');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // choose 依赖 remember，但 Esc 走的是 cancel 分支，用不到它
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="close-confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        // 点遮罩＝取消；点弹窗本体不算
        if (event.target === event.currentTarget) choose('cancel');
      }}
    >
      <div
        aria-describedby="close-confirm-detail"
        aria-labelledby="close-confirm-title"
        aria-modal="true"
        className="close-confirm"
        role="dialog"
      >
        <h2 className="close-confirm-title" id="close-confirm-title">
          {t('background.close.title')}
        </h2>
        <p className="close-confirm-detail" id="close-confirm-detail">
          {t('background.close.detail')}
        </p>

        <label className="close-confirm-remember" htmlFor="close-confirm-keep">
          <input
            checked={remember}
            id="close-confirm-keep"
            onChange={(event) => setRemember(event.target.checked)}
            type="checkbox"
          />
          <span>{t('background.close.remember')}</span>
        </label>

        <div className="close-confirm-actions">
          <button
            className="btn-plain close-confirm-btn is-ghost"
            onClick={() => choose('cancel')}
            type="button"
          >
            {t('background.close.cancel')}
          </button>
          <button
            className="btn-plain close-confirm-btn is-quiet"
            onClick={() => choose('quit')}
            type="button"
          >
            {t('background.close.quit')}
          </button>
          <button
            className="btn-plain close-confirm-btn is-primary"
            onClick={() => choose('tray')}
            ref={primaryRef}
            type="button"
          >
            {t('background.close.tray')}
          </button>
        </div>
      </div>
    </div>
  );
}
