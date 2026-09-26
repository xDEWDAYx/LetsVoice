import { useLocation } from 'react-router-dom';
import { RoutePath } from './RouteManager';

/**
 * 「从哪来回哪去」的返回目标。
 *
 * 页面之间跳转时把来源路径放进 history state 的 from 字段，详情页据此决定
 * 返回按钮指向哪里，而不是所有入口都硬回首页——从仪表板点进一条笔记，
 * 返回却落到对话工作台，用户等于被踢出了原来的上下文。
 */

/** 返回目标缺省值：直接打开详情页（刷新、深链）时没有来源可用。 */
export const DEFAULT_BACK_PATH: string = RoutePath.Workspace;

/**
 * history state 是可以被任意写入的，用之前先确认它确实是一条站内路径：
 * 单个 / 开头、不是 //host 这种协议相对地址。
 */
function isInternalPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/(?!\/)/.test(value);
}

export function readBackPath(
  state: unknown,
  fallback: string = DEFAULT_BACK_PATH,
): string {
  const from = (state as { from?: unknown } | null | undefined)?.from;
  return isInternalPath(from) ? from : fallback;
}

/** 各页在侧边栏里的名字，用来把返回按钮写成「返回仪表板」这种。 */
const PATH_TO_LABEL_KEY: Record<string, string> = {
  '/': 'sidebar.transcription',
  [RoutePath.Transcription]: 'sidebar.transcription',
  [RoutePath.Dashboard]: 'sidebar.dashBoard',
  [RoutePath.Workspace]: 'sidebar.workspace',
  [RoutePath.ModelManagement]: 'sidebar.modelManagement',
  [RoutePath.Settings]: 'sidebar.settings',
  '/Agent': 'sidebar.agent',
};

/** 返回目标对应的页面名翻译键；认不出来的路径返回 null，按钮就只写「返回」。 */
export function backLabelKey(path: string): string | null {
  return PATH_TO_LABEL_KEY[path] ?? null;
}

export type BackNavigation = {
  path: string;
  /** 页面名的翻译键，null 表示叫不出名字。 */
  labelKey: string | null;
};

export function useBackNavigation(
  fallback: string = DEFAULT_BACK_PATH,
): BackNavigation {
  const location = useLocation();
  const path = readBackPath(location.state, fallback);
  return { path, labelKey: backLabelKey(path) };
}
