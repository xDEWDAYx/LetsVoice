/**
 * AI 思考中的三点。
 *
 * 上下浮动而不是原地闪烁 —— 闪烁在长时间等待里很刺眼，
 * 浮动更耐看，也更像「在处理」而不是「出错了」。
 */
type ThinkingDotsProps = {
  label?: string;
  className?: string;
};

export default function ThinkingDots({
  label,
  className = '',
}: ThinkingDotsProps) {
  return (
    <span
      className={`thinking-dots ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      {label ? <em className="fx-text-shimmer">{label}</em> : null}
      <span className="thinking-dots__track" aria-hidden="true">
        <i className="anim-think-dot" />
        <i className="anim-think-dot" />
        <i className="anim-think-dot" />
      </span>
    </span>
  );
}
