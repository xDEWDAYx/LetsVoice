import { LanguageSetting } from '../settings/SettingsService';

/**
 * 主进程里的少量界面文案（托盘菜单、关闭询问框）。
 *
 * 渲染层的 i18n 跑在另一个进程里，主进程用不了，所以这里按语言各写一份。
 * 只有这么几条，不值得为它再搭一套 i18n。
 */
export type BackgroundLabels = {
  trayTooltip: string;
  trayShow: string;
  trayDashboard: string;
  trayTodos: string;
  trayQuickRecord: string;
  traySettings: string;
  trayQuit: string;
  closeTitle: string;
  closeMessage: string;
  closeDetail: string;
  closeRemember: string;
  closeToTray: string;
  closeQuit: string;
  closeCancel: string;
};

const ZH: BackgroundLabels = {
  trayTooltip: 'SpeakSpace Local · 后台运行中',
  trayShow: '显示主界面',
  trayDashboard: '仪表板',
  trayTodos: '今日待办',
  trayQuickRecord: '开始录音',
  traySettings: '设置',
  trayQuit: '退出 SpeakSpace Local',
  closeTitle: '关闭 SpeakSpace Local',
  closeMessage: '关闭窗口后要怎么处理？',
  closeDetail:
    '最小化到托盘会让程序继续在后台运行，全局快捷键（呼出仪表板、待办、快速录音）才能用。',
  closeRemember: '记住我的选择，不再询问',
  closeToTray: '最小化到托盘',
  closeQuit: '直接退出',
  closeCancel: '取消',
};

const EN: BackgroundLabels = {
  trayTooltip: 'SpeakSpace Local · running in background',
  trayShow: 'Show main window',
  trayDashboard: 'Dashboard',
  trayTodos: "Today's to-dos",
  trayQuickRecord: 'Start recording',
  traySettings: 'Settings',
  trayQuit: 'Quit SpeakSpace Local',
  closeTitle: 'Close SpeakSpace Local',
  closeMessage: 'What should closing the window do?',
  closeDetail:
    'Minimising to the tray keeps SpeakSpace Local running so the global shortcuts (dashboard, to-dos, quick record) keep working.',
  closeRemember: 'Remember my choice',
  closeToTray: 'Minimise to tray',
  closeQuit: 'Quit',
  closeCancel: 'Cancel',
};

export function backgroundLabels(language: LanguageSetting): BackgroundLabels {
  return language === 'en' ? EN : ZH;
}

export default backgroundLabels;
