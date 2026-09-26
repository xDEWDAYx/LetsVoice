import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import HudShell from './HudShell';

/** 波纹柱。胶囊很窄，9 根刚好占满中间那一段。 */
const WAVE_BARS = Array.from({ length: 9 }, (_, index) => index);

/**
 * 录音胶囊的内容：左取消 · 中波纹 · 右完成，没有别的。
 *
 * 只负责画。新手引导要在主界面下方原样摆一个出来，
 * 拆开之后两边用的是同一段 JSX。
 *
 * 类名不能再叫 hud-record：外层窗口壳的 class 是 "hud hud-record"，
 * 同名会让这一行的 flex 规则连外壳一起套上——卡片就不再撑满窗口，
 * 于是圆按钮把胶囊撑得死死的，上下一点缝都没有。
 */
export function RecordHudView({
  error = null,
  onCancel,
  onDone,
}: {
  error?: string | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="hud-record-bar">
        <button
          aria-label={t('hud.record.cancel')}
          className="hud-record-btn is-cancel"
          onClick={onCancel}
          title={t('hud.record.cancel')}
          type="button"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5L5 15"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.1"
            />
          </svg>
        </button>

        {/* 出错时波纹转红：胶囊上没有地方写字，颜色是唯一能表达异常的手段 */}
        <span
          className={`hud-wave${error ? ' has-error' : ''}`}
          aria-hidden="true"
        >
          {WAVE_BARS.map((index) => (
            <span
              className="hud-wave-bar"
              key={index}
              // 每根柱子错开起始相位，才不会整排一起上下
              style={{ animationDelay: `${index * 110}ms` }}
            />
          ))}
        </span>

        <button
          aria-label={t('hud.record.done')}
          className="hud-record-btn is-done"
          onClick={onDone}
          title={t('hud.record.done')}
          type="button"
        >
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
            <path
              d="M4.5 10.5l4 4 7-8"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.3"
            />
          </svg>
        </button>
      </div>

      {/* 报错只给读屏软件，胶囊上不占位置 */}
      {error ? (
        <span className="sr-only" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

/**
 * 录音浮窗：屏幕下方居中的一条小胶囊。
 *
 * 它是一个「正在录音」的指示器，不是一块仪表盘，所以不显示时长和文字。
 *
 * 录音本身在主窗口的渲染层跑（MediaRecorder 在那儿，主窗口可能是隐藏的），
 * 这里只负责显示状态和把两个操作发回主进程。
 */
export default function RecordHud() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electron.hud;
    if (!api?.onRecordingState) return undefined;
    const dispose = api.onRecordingState((raw: unknown) => {
      const state = raw as { error?: string | null };
      setError(state?.error ?? null);
    });
    return () => {
      dispose();
    };
  }, []);

  return (
    <HudShell kind="record">
      <RecordHudView
        error={error}
        onCancel={() => window.electron.hud?.cancelRecording?.()}
        onDone={() => window.electron.hud?.stopRecording?.()}
      />
    </HudShell>
  );
}
