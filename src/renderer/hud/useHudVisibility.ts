import { useEffect, useState } from 'react';

/**
 * 浮窗「被显示了第几次」。
 *
 * 浮窗现在是预热好常驻的（隐藏而非销毁），所以组件只会挂载一次：
 * 取数和自动淡出不能再挂在 mount 上，得跟着每一次显示重来。
 * 返回一个自增的计数，调用方把它放进依赖数组即可。
 */
export default function useHudVisibility(): number {
  const [shownAt, setShownAt] = useState(0);

  useEffect(() => {
    const api = window.electron.hud;
    if (!api?.onShown) return undefined;
    const dispose = api.onShown(() => setShownAt((value) => value + 1));
    return () => {
      dispose();
    };
  }, []);

  return shownAt;
}
