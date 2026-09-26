import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toSpeechText from './TTSContent';
import useTTSPlayback from './useTTSPlayback';
import './TTSPlayButton.css';

function SpeakerIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/**
 * 可复用朗读按钮：使用模型管理页保存的默认音色。
 * autoPlay 为 true 时挂载即朗读一次，用的是同一个播放实例，
 * 所以按钮会立刻变成停止键，用户随时能打断。
 */
export default function TTSPlayButton({
  text,
  autoPlay = false,
}: {
  text: string;
  autoPlay?: boolean;
}) {
  const { t } = useTranslation();
  const playback = useTTSPlayback();
  const autoPlayed = useRef(false);
  const play = useCallback(() => {
    playback.speak(toSpeechText(text));
  }, [playback, text]);

  useEffect(() => {
    if (!autoPlay || autoPlayed.current || !text.trim()) return;
    // 同一段文字只自动播一次，重渲染不会重复朗读。
    autoPlayed.current = true;
    // 失败不再静默跳过：读不出来时把原因显示在按钮旁边，
    // 否则用户只会看到「没有声音」，不知道是模型没装还是别的问题。
    play();
  }, [autoPlay, play, text]);

  return (
    <span className="tts-play-control">
      {playback.playing ? (
        <button
          className="tts-play-button"
          onClick={playback.stop}
          type="button"
          aria-label={t('components.tts.stop')}
          title={t('components.tts.stop')}
        >
          <StopIcon />
        </button>
      ) : (
        <button
          className="tts-play-button"
          disabled={playback.loading || !text.trim()}
          onClick={play}
          type="button"
          aria-label={
            playback.loading
              ? t('components.tts.generatingLabel')
              : t('components.tts.play')
          }
          title={
            playback.loading
              ? t('components.tts.generatingTitle')
              : t('components.tts.play')
          }
        >
          {playback.loading ? (
            <span className="tts-play-spinner" aria-hidden="true" />
          ) : (
            <SpeakerIcon />
          )}
        </button>
      )}
      {playback.error && <small role="alert">{playback.error}</small>}
    </span>
  );
}
