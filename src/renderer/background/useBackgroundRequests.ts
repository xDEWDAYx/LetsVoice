import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** 主进程（托盘菜单 / 全局快捷键）转发过来的请求。 */
export type BackgroundRequest =
  | { type: 'navigate'; path: string }
  | { type: 'startQuickRecord' }
  | { type: 'stopQuickRecord' }
  | { type: 'cancelQuickRecord' };

const REQUEST_TYPES = [
  'navigate',
  'startQuickRecord',
  'stopQuickRecord',
  'cancelQuickRecord',
];

function isBackgroundRequest(value: unknown): value is BackgroundRequest {
  if (typeof value !== 'object' || value === null) return false;
  const { type } = value as { type?: unknown };
  return typeof type === 'string' && REQUEST_TYPES.includes(type);
}

/**
 * 接住托盘和全局快捷键发来的动作。
 *
 * 挂在 Router 里、整个应用只挂一份。
 *
 * 「开始录音」由这里负责先跳到对话工作台：录音引擎在那个页面里，
 * 如果当时停在仪表板或工作空间，那个页面根本没挂载，请求就落空了
 * ——按下快捷键没反应、点停止也没反应，就是这个原因。
 * 停止 / 取消不用跳转：能录上音就说明工作台已经挂着了。
 */
export default function useBackgroundRequests(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const api = window.electron.background;
    if (!api?.onRequest) return undefined;

    const dispose = api.onRequest((raw: unknown) => {
      if (!isBackgroundRequest(raw)) return;
      if (raw.type === 'navigate') {
        navigate(raw.path);
        return;
      }
      if (raw.type === 'startQuickRecord') {
        // 时间戳既是「开录」的信号，也保证连续两次触发的 state 不相等
        navigate('/', { state: { quickRecord: Date.now() } });
      }
    });
    // preload 返回的是取消订阅函数，包一层免得把它的返回值当成清理结果
    return () => {
      dispose();
    };
  }, [navigate]);
}
