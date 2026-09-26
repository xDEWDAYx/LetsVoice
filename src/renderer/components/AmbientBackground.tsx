/**
 * 全局环境光背景。
 *
 * 固定在最底层（z-index:0），三团缓慢漂移的大色斑 + 一道扫描光带
 * + 一层胶片噪点。噪点是关键：纯渐变背景很容易显得像渲染图，
 * 铺一层极淡的颗粒之后画面才有材质。
 *
 * 所有动画都只改 transform，不触发重排/重绘；pointer-events:none
 * 保证它不吃任何鼠标事件。
 */
export default function AmbientBackground() {
  return (
    <div className="fx-ambient" aria-hidden="true">
      <span className="fx-ambient__blob fx-ambient__blob--a" />
      <span className="fx-ambient__blob fx-ambient__blob--b" />
      <span className="fx-ambient__blob fx-ambient__blob--c" />
      <span className="fx-ambient__scan" />
      <span className="fx-ambient__grain" />
    </div>
  );
}
