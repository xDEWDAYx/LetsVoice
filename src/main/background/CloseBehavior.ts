import { BackgroundSettings, CloseAction } from '@shared/types/BackgroundTypes';

/**
 * 关闭主窗口时到底做什么。
 *
 * 逻辑本身不碰 Electron，方便单测：真正的窗口操作交给调用方。
 */
export type CloseDecision = 'hide' | 'quit' | 'ask';

export type CloseContext = {
  /** 用户已经选了「退出」（菜单退出 / 托盘退出 / 系统关机） */
  quitting: boolean;
  settings: BackgroundSettings;
};

export function decideCloseAction(context: CloseContext): CloseDecision {
  // 已经在退出流程里就别再拦，否则关不掉
  if (context.quitting) return 'quit';
  // 托盘关着的时候没有地方可最小化，只能退出
  if (!context.settings.trayEnabled) return 'quit';

  const action: CloseAction = context.settings.closeAction;
  if (action === 'tray') return 'hide';
  if (action === 'quit') return 'quit';
  return 'ask';
}

/** 询问框的按钮顺序，索引要和处理结果对得上，单测锁住它。 */
export const CLOSE_PROMPT_BUTTONS = ['tray', 'quit', 'cancel'] as const;

export type ClosePromptChoice = (typeof CLOSE_PROMPT_BUTTONS)[number];

export type ClosePromptResult = {
  response: number;
  checkboxChecked: boolean;
};

export type ClosePromptOutcome = {
  decision: CloseDecision | 'cancel';
  /** 勾了「记住我的选择」时要写回设置的值；没勾就是 null。 */
  remember: CloseAction | null;
};

/**
 * 渲染层那个应用内弹窗给回来的选择。
 *
 * 系统弹窗只能拿到按钮下标，应用内弹窗直接给语义值，不用再对下标；
 * 两条路最终都汇到同一个 ClosePromptOutcome。
 */
export function interpretCloseChoice(
  choice: ClosePromptChoice,
  remember: boolean,
): ClosePromptOutcome {
  if (choice === 'cancel') return { decision: 'cancel', remember: null };
  return {
    decision: choice === 'tray' ? 'hide' : 'quit',
    remember: remember ? choice : null,
  };
}

export function interpretClosePrompt(
  result: ClosePromptResult,
): ClosePromptOutcome {
  const choice: ClosePromptChoice =
    CLOSE_PROMPT_BUTTONS[result.response] ?? 'cancel';

  if (choice === 'cancel') return { decision: 'cancel', remember: null };

  const decision: CloseDecision = choice === 'tray' ? 'hide' : 'quit';
  return {
    decision,
    remember: result.checkboxChecked ? choice : null,
  };
}
