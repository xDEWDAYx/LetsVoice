/**
 * 关闭用的叉。
 *
 * 统一用画的，不要用「×」这个字符：字形自带左右不对称的边距、基线又比几何
 * 中心低，放进方框里怎么调都会偏一点点，而且偏多少还随字体和字号变。
 * 这个 path 在 20×20 的 viewBox 里正中对称，配 place-items: center 就是死正。
 */
export default function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="0 0 20 20"
      width={size}
      focusable="false"
    >
      <path
        d="M5 5l10 10M15 5L5 15"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
