/**
 * 声波条：本产品的主题微动画。
 *
 * 用在品牌标、录音中状态、语音播放按钮旁。默认静止（static），
 * 只有明确处于「进行中」时才起伏 —— 界面上一直在动的元素会持续
 * 抢注意力，反而显得廉价。
 */
type SoundWaveProps = {
  /** true 时波形起伏，false 时定格成一排静止的短条 */
  active?: boolean;
  bars?: number;
  /** 整体高度（px），条宽和间距按比例缩放 */
  size?: number;
  className?: string;
};

// 静止时各条的高度比例，刻意不对称，像一段真实波形被按了暂停
const RESTING_SCALE = [0.45, 0.75, 1, 0.6, 0.85, 0.4, 0.7];

export default function SoundWave({
  active = false,
  bars = 5,
  size = 16,
  className = '',
}: SoundWaveProps) {
  const count = Math.max(1, Math.min(bars, RESTING_SCALE.length));
  const barWidth = Math.max(2, Math.round(size / 8));
  const gap = Math.max(2, Math.round(barWidth * 0.85));

  return (
    <span
      className={`sound-wave${active ? ' is-active' : ''} ${className}`.trim()}
      style={{ height: size, gap: `${gap}px` }}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <i
          // 条的数量固定且无序，index 作 key 不会有复用问题
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className={active ? 'anim-wave-bar' : undefined}
          style={{
            width: barWidth,
            transform: active
              ? undefined
              : `scaleY(${RESTING_SCALE[index] ?? 0.6})`,
          }}
        />
      ))}
    </span>
  );
}
