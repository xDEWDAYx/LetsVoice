/**
 * 引导步骤定义。
 *
 * 每一步描述的是「带用户走到哪儿、指着什么说话」，而不是一页文案：
 *   route  —— 先自动跳到这个页面
 *   target —— 再把聚光灯打到这个元素上（CSS 选择器）
 *   说的话 —— 用大白话讲清这块能干嘛
 *
 * target 写 null 表示这一步不指任何具体控件（开场和结束），
 * 卡片会停在屏幕中央。
 *
 * 选择器优先用 data-tour 属性；只有那些本来就语义稳定的类名
 * （.studio-composer 这种）才直接用类名。因为类名是给样式用的，
 * 随时可能因为改版被换掉，而 data-tour 一眼就能看出「这里被引导引用了，
 * 别乱改」。
 */
import type { HudKind } from '@shared/hud/HudLayout';
import type { ClickDemoSpec } from './TourClickDemo';
import type { DragDemoSpec } from './TourDragDemo';
import type { HoverDemoSpec } from './TourHoverDemo';

/**
 * 说明卡摆在哪儿。
 *   auto   —— 贴着聚光灯放得下的那一侧（绝大多数步骤）
 *   center —— 屏幕正中（开场、结束这种不打光的）
 *   corner —— 钉在右下角。给那种「聚光灯几乎罩住整页」的步骤用：
 *             auto 这时会退化成贴着某条边居中，正好压在演示上。
 */
export type StepPlacement = 'auto' | 'center' | 'corner';

/** 引导自己摆出来的那个演示浮窗；讲快捷键的三步都打光在它身上。 */
export const HUD_DEMO_TARGET = '[data-tour="hud-demo"]';

/**
 * 设置页里具体某一栏。
 *
 * 面板只有在那一栏被选中时才渲染，光跳到 /Settings 是指不到里面控件的 ——
 * 聚光灯会找不到目标，干等 2.6 秒然后退化成一张飘在屏幕中央的卡片。
 */
const settingsSection = (section: string) => `/Settings?section=${section}`;

export type OnboardingStep = {
  /** 稳定 id，用作 React key 和进度定位 */
  id: string;
  /**
   * 进入这一步时跳转到的路由。每一步都必须写，不能省略：
   * 往回退的时候也要重新断言一次页面，否则「上一步」只会把弹窗挪回去，
   * 而页面还停在后一步那一页，聚光灯自然就找不到目标了。
   */
  route: string;
  /** Resolve the first available workspace just before entering this step. */
  dynamicRoute?: 'firstWorkspace';
  /** 高亮目标的选择器；null 表示居中展示不打光 */
  target: string | null;
  placement: StepPlacement;
  titleKey: string;
  descKey: string;
  /** 可选的一句操作提示，显示在描述下方，带一个跳动的箭头 */
  hintKey?: string;
  /**
   * 这一步要在界面上摆一个「实物」浮窗出来。
   *
   * 那三个浮窗是独立窗口，引导的聚光灯照不到它们，光用文字说
   * 「右下角会弹出一张卡片」用户还是不知道长什么样。所以由引导自己在
   * 真实的落点（右下角 / 下方居中）渲染一个同样的浮窗，再把聚光灯打上去。
   * 目标选择器就是下面这个 HUD_DEMO_TARGET。
   */
  hudDemo?: HudKind;
  /**
   * 这一步要演示一次「从哪儿拖到哪儿」。
   *
   * 拖拽光靠文字讲不清：说「拖到右边的对话框」，用户既不知道终点是哪一块，
   * 也不知道拖过去之后会发生什么。写上之后引导会让一张虚拟卡片自己飞一趟。
   * 起点找不到时退回这一步的 target。
   */
  dragDemo?: DragDemoSpec;
  /**
   * 这一步要演示一次「双击这里，那边会开出一块东西」。
   *
   * 双击是隐藏动作，界面上没有任何提示说这东西还能双击。写上之后引导会画
   * 一个鼠标指针过去连点两下，再把开出来的面板演一遍。
   * 被双击的元素找不到时退回这一步的 target。
   */
  clickDemo?: ClickDemoSpec;
  /**
   * 这一步要把一整套「悬停联动」真的跑一遍。
   *
   * 引导会往真实元素上派发鼠标事件，弹窗、滚动、行高亮都是应用自己的反应，
   * 所以演示永远不会和真实行为对不上。
   */
  hoverDemo?: HoverDemoSpec;
};

const ONBOARDING_STEP_CATALOG: OnboardingStep[] = [
  {
    id: 'welcome',
    route: '/',
    target: null,
    placement: 'center',
    titleKey: 'onboarding.tour.welcome.title',
    descKey: 'onboarding.tour.welcome.desc',
  },
  {
    id: 'nav',
    route: '/',
    target: '[data-tour="sidebar-nav"]',
    placement: 'auto',
    titleKey: 'onboarding.tour.nav.title',
    descKey: 'onboarding.tour.nav.desc',
  },
  {
    id: 'composer',
    route: '/',
    target: '.studio-composer',
    placement: 'auto',
    titleKey: 'onboarding.tour.composer.title',
    descKey: 'onboarding.tour.composer.desc',
    hintKey: 'onboarding.tour.composer.hint',
  },
  {
    id: 'record',
    route: '/',
    target: '.studio-record-button',
    placement: 'auto',
    titleKey: 'onboarding.tour.record.title',
    descKey: 'onboarding.tour.record.desc',
    hintKey: 'onboarding.tour.record.hint',
  },
  {
    id: 'upload',
    route: '/',
    target: '.studio-upload-button',
    placement: 'auto',
    titleKey: 'onboarding.tour.upload.title',
    descKey: 'onboarding.tour.upload.desc',
  },
  {
    id: 'agent',
    route: '/',
    target: '.studio-agent-toggle',
    placement: 'auto',
    titleKey: 'onboarding.tour.agent.title',
    descKey: 'onboarding.tour.agent.desc',
    hintKey: 'onboarding.tour.agent.hint',
  },
  {
    id: 'library',
    route: '/',
    target: '.ask-ai-library',
    placement: 'auto',
    titleKey: 'onboarding.tour.library.title',
    descKey: 'onboarding.tour.library.desc',
  },
  {
    id: 'libraryDrag',
    route: '/',
    target: '.ask-ai-note-list',
    placement: 'auto',
    titleKey: 'onboarding.tour.libraryDrag.title',
    descKey: 'onboarding.tour.libraryDrag.desc',
    hintKey: 'onboarding.tour.libraryDrag.hint',
    // 起点是列表里第一张笔记卡片，终点是右边整块对话区
    dragDemo: {
      fromSelector: '.ask-ai-note-card',
      toSelector: '.studio-chat',
    },
  },
  {
    id: 'notePreview',
    route: '/',
    // 和上一步指同一块，聚光灯不用挪；双击哪一张由 clickDemo 自己演
    target: '.ask-ai-note-list',
    placement: 'auto',
    titleKey: 'onboarding.tour.notePreview.title',
    descKey: 'onboarding.tour.notePreview.desc',
    hintKey: 'onboarding.tour.notePreview.hint',
    clickDemo: {
      onSelector: '.ask-ai-note-card',
      panelHostSelector: '.studio-page',
    },
  },
  {
    id: 'recents',
    route: '/',
    target: '.ask-ai-recents',
    placement: 'auto',
    titleKey: 'onboarding.tour.recents.title',
    descKey: 'onboarding.tour.recents.desc',
  },
  {
    id: 'splitter',
    route: '/',
    target: '.ask-ai-library-splitter',
    placement: 'auto',
    titleKey: 'onboarding.tour.splitter.title',
    descKey: 'onboarding.tour.splitter.desc',
    hintKey: 'onboarding.tour.splitter.hint',
  },
  {
    id: 'workspace',
    route: '/Workspace',
    target: '.workspace-home-create',
    placement: 'auto',
    titleKey: 'onboarding.tour.workspace.title',
    descKey: 'onboarding.tour.workspace.desc',
  },
  {
    id: 'newNote',
    route: '/DashBoard',
    target: '.create-note-btn',
    placement: 'auto',
    titleKey: 'onboarding.tour.newNote.title',
    descKey: 'onboarding.tour.newNote.desc',
  },
  {
    id: 'dashboard',
    route: '/DashBoard',
    target: '.metric-cards-grid',
    placement: 'auto',
    titleKey: 'onboarding.tour.dashboard.title',
    descKey: 'onboarding.tour.dashboard.desc',
  },
  {
    id: 'calendar',
    route: '/DashBoard',
    target: '.calendar-widget',
    placement: 'auto',
    titleKey: 'onboarding.tour.calendar.title',
    descKey: 'onboarding.tour.calendar.desc',
    hintKey: 'onboarding.tour.calendar.hint',
  },
  {
    id: 'calendarTodos',
    route: '/DashBoard',
    // 联动的两头（日历和笔记列表）都得亮着，所以打光在装着它俩的那一整块；
    // 卡片相应钉到右下角，别压住弹窗
    target: '.dashboard-main-content',
    placement: 'corner',
    titleKey: 'onboarding.tour.calendarTodos.title',
    descKey: 'onboarding.tour.calendarTodos.desc',
    hintKey: 'onboarding.tour.calendarTodos.hint',
    hoverDemo: {
      openSelector: '.calendar-day.has-events',
      itemSelector: '.calendar-popover-panel .todo-item-card',
      maxItems: 2,
    },
  },
  {
    id: 'todoDateHover',
    route: '/DashBoard',
    // 反向联动：手停在右边的列表，亮的是左边的日历，两头同样都得看得见
    target: '.dashboard-main-content',
    placement: 'corner',
    titleKey: 'onboarding.tour.todoDateHover.title',
    descKey: 'onboarding.tour.todoDateHover.desc',
    hintKey: 'onboarding.tour.todoDateHover.hint',
    // 停在日期药丸上就行 —— 事件冒泡到那一格，联动是挂在格子上的。
    // 不用 .td-todo:has(.todo-date-pill)：没有待办的格子传的是 null，
    // 停上去什么都不会亮，等于演了个寂寞。
    hoverDemo: {
      itemSelector: '.notes-table .todo-date-pill',
      maxItems: 3,
    },
  },
  {
    id: 'models',
    route: '/ModelManagement',
    target: '.model-module-list',
    placement: 'auto',
    titleKey: 'onboarding.tour.models.title',
    descKey: 'onboarding.tour.models.desc',
    hintKey: 'onboarding.tour.models.hint',
  },
  {
    id: 'settings',
    route: '/Settings',
    target: '.settings-nav',
    placement: 'auto',
    titleKey: 'onboarding.tour.settings.title',
    descKey: 'onboarding.tour.settings.desc',
  },
  {
    id: 'settingsAgent',
    route: settingsSection('agent'),
    target: '[data-tour="settings-agent-panel"]',
    placement: 'auto',
    titleKey: 'onboarding.tour.settingsAgent.title',
    descKey: 'onboarding.tour.settingsAgent.desc',
    hintKey: 'onboarding.tour.settingsAgent.hint',
  },
  {
    id: 'background',
    route: settingsSection('background'),
    target: '[data-tour="settings-close-behavior"]',
    placement: 'auto',
    titleKey: 'onboarding.tour.background.title',
    descKey: 'onboarding.tour.background.desc',
    hintKey: 'onboarding.tour.background.hint',
  },
  {
    id: 'shortcuts',
    route: settingsSection('background'),
    target: '[data-tour="settings-shortcut-list"]',
    placement: 'auto',
    titleKey: 'onboarding.tour.shortcuts.title',
    descKey: 'onboarding.tour.shortcuts.desc',
    hintKey: 'onboarding.tour.shortcuts.hint',
  },
  // 三个浮窗是独立窗口，聚光灯照不到真身；这三步由引导在真实落点摆一个
  // 一模一样的出来（见 hudDemo），再把光打上去。
  {
    id: 'hudStats',
    route: settingsSection('background'),
    target: HUD_DEMO_TARGET,
    placement: 'auto',
    titleKey: 'onboarding.tour.hudStats.title',
    descKey: 'onboarding.tour.hudStats.desc',
    hintKey: 'onboarding.tour.hudStats.hint',
    hudDemo: 'stats',
  },
  {
    id: 'hudTodos',
    route: settingsSection('background'),
    target: HUD_DEMO_TARGET,
    placement: 'auto',
    titleKey: 'onboarding.tour.hudTodos.title',
    descKey: 'onboarding.tour.hudTodos.desc',
    hintKey: 'onboarding.tour.hudTodos.hint',
    hudDemo: 'todos',
  },
  {
    id: 'hudRecord',
    route: settingsSection('background'),
    target: HUD_DEMO_TARGET,
    placement: 'auto',
    titleKey: 'onboarding.tour.hudRecord.title',
    descKey: 'onboarding.tour.hudRecord.desc',
    hintKey: 'onboarding.tour.hudRecord.hint',
    hudDemo: 'record',
  },
  {
    id: 'trash',
    route: settingsSection('trash'),
    target: '[data-tour="settings-trash-panel"]',
    placement: 'auto',
    titleKey: 'onboarding.tour.trash.title',
    descKey: 'onboarding.tour.trash.desc',
    hintKey: 'onboarding.tour.trash.hint',
  },
  {
    id: 'done',
    route: '/',
    target: null,
    placement: 'center',
    titleKey: 'onboarding.tour.done.title',
    descKey: 'onboarding.tour.done.desc',
    hintKey: 'onboarding.tour.done.hint',
  },
];

/**
 * Keep the detailed catalog above as reusable material for contextual help, but
 * make the first-run tour deliberately short. Controls that sit together are
 * taught as one group instead of advancing once per button.
 */
function catalogStep(
  id: string,
  patch: Partial<OnboardingStep> = {},
): OnboardingStep {
  const step = ONBOARDING_STEP_CATALOG.find((item) => item.id === id);
  if (!step) throw new Error(`Unknown onboarding step: ${id}`);
  return { ...step, ...patch };
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  catalogStep('welcome', {
    target: '[data-tour="sidebar-nav"]',
    placement: 'auto',
  }),
  // The composer contains text input, record, upload and agent-mode controls.
  catalogStep('composer'),
  // One library step covers grouping, drag-to-chat and double-click preview.
  catalogStep('libraryDrag', { target: '.ask-ai-library' }),
  // Recent conversations and their resize divider are one adjacent region.
  catalogStep('recents', {
    hintKey: 'onboarding.tour.splitter.hint',
  }),
  catalogStep('workspace', {
    target: '[data-tour="workspace-home-create"]',
  }),
  {
    id: 'workspaceDetail',
    route: '/Workspace',
    dynamicRoute: 'firstWorkspace',
    target: '[data-tour="workspace-detail-header"]',
    placement: 'auto',
    titleKey: 'onboarding.tour.workspaceDetail.title',
    descKey: 'onboarding.tour.workspaceDetail.desc',
    hintKey: 'onboarding.tour.workspaceDetail.hint',
  },
  {
    id: 'workspaceNotes',
    route: '/Workspace',
    dynamicRoute: 'firstWorkspace',
    target: '[data-tour="workspace-detail-notes"]',
    placement: 'corner',
    titleKey: 'onboarding.tour.workspaceNotes.title',
    descKey: 'onboarding.tour.workspaceNotes.desc',
    hintKey: 'onboarding.tour.workspaceNotes.hint',
  },
  // The page header's create button and metric cards are introduced together.
  catalogStep('dashboard', {
    target: '.dashboard-page-container',
    placement: 'corner',
  }),
  // The same step demonstrates calendar -> note and explains the reverse link.
  catalogStep('calendarTodos'),
  catalogStep('models'),
  // The nav and active Assistant panel are visible side by side.
  catalogStep('settings', {
    route: settingsSection('agent'),
    target: '.settings-layout',
    placement: 'corner',
  }),
  // Close behaviour and the shortcut editor are adjacent in this content area.
  catalogStep('background', {
    target: '.settings-content',
    placement: 'corner',
  }),
  // One representative HUD replaces three consecutive floating-window steps.
  catalogStep('hudStats'),
  catalogStep('trash'),
  catalogStep('done'),
];
