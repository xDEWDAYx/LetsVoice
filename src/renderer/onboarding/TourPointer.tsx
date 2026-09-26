/**
 * 引导演示里那个鼠标指针。
 *
 * 箭头尖在图形的左上角 —— 配合 transform-origin: top left，
 * 缩放（点击时的下压）不会让尖端离开落点。
 */
export default function TourPointer({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M4 2.5l13.5 8.2-5.9 1.1 3.2 6.4-2.6 1.3-3.2-6.4L4 17z"
        fill="var(--surface-raised)"
        stroke="var(--text)"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
