import fs from 'fs';
import path from 'path';
import {
  HUD_DEMO_TARGET,
  ONBOARDING_STEPS,
} from '../renderer/onboarding/OnboardingSteps';
import {
  isSettingsCategoryId,
  SETTINGS_CATEGORIES,
} from '../renderer/pages/Settings/SettingsOptions';

const zh = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../i18n/locales/zh.json'), 'utf8'),
) as Record<string, string>;
const en = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../i18n/locales/en.json'), 'utf8'),
) as Record<string, string>;

/**
 * 引导最容易坏的地方不是逻辑，是「加了一步却漏了文案」——
 * 界面上就直接显示 i18n key，而且只有走到那一步才发现。
 */
describe('引导步骤与文案', () => {
  it('每一步的标题、描述、提示都有中英文', () => {
    const missing: string[] = [];
    ONBOARDING_STEPS.forEach((step) => {
      [step.titleKey, step.descKey, step.hintKey]
        .filter((key): key is string => Boolean(key))
        .forEach((key) => {
          if (!zh[key]) missing.push(`zh: ${key}`);
          if (!en[key]) missing.push(`en: ${key}`);
        });
    });

    expect(missing).toEqual([]);
  });

  it('id 不重复——它同时是 React key 和进度定位', () => {
    const ids = ONBOARDING_STEPS.map((step) => step.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每一步都写了路由，往回退时才能把页面也带回去', () => {
    ONBOARDING_STEPS.forEach((step) => {
      expect(step.route).toMatch(/^\//);
    });
  });

  it('不打光的步骤必须居中，否则卡片会飘在左上角', () => {
    ONBOARDING_STEPS.filter((step) => step.target === null).forEach((step) => {
      expect(step.placement).toBe('center');
    });
  });

  it('把 27 个逐控件步骤合并成 15 个主题步骤', () => {
    const ids = ONBOARDING_STEPS.map((step) => step.id);

    expect(ids).toEqual([
      'welcome',
      'composer',
      'libraryDrag',
      'recents',
      'workspace',
      'workspaceDetail',
      'workspaceNotes',
      'dashboard',
      'calendarTodos',
      'models',
      'settings',
      'background',
      'hudStats',
      'trash',
      'done',
    ]);
    // These controls now live in their neighbouring topic instead of taking a
    // full click of their own.
    [
      'record',
      'upload',
      'agent',
      'splitter',
      'shortcuts',
      'hudTodos',
      'hudRecord',
    ].forEach((mergedId) => expect(ids).not.toContain(mergedId));
  });

  it('要摆实物浮窗的那几步，聚光灯得打在浮窗上', () => {
    // 两者对不上时不会报错，只会在那一步干等 2.6 秒然后退化成一张飘着的
    // 居中卡片——正好把要展示的浮窗晾在一边，最难发现的那种坏法
    const demoSteps = ONBOARDING_STEPS.filter((step) => step.hudDemo);

    expect(demoSteps.map((step) => step.hudDemo)).toEqual(['stats']);
    demoSteps.forEach((step) => {
      expect(step.target).toBe(HUD_DEMO_TARGET);
      expect(step.placement).toBe('auto');
    });
  });

  it('示例待办的文案中英文都在——库是空的新用户看到的就是它', () => {
    ['A', 'B', 'C'].forEach((suffix) => {
      const key = `onboarding.tour.hudTodos.sample${suffix}`;
      expect(zh[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    });
  });

  it('设置页里指到面板的那几步，必须带上 ?section= 把那一栏打开', () => {
    // 面板只在对应分类被选中时渲染。跳到光秃秃的 /Settings 再去找面板里的
    // 控件，聚光灯会干等 2.6 秒然后退化成一张飘在屏幕中央的卡片——
    // 讲的是「这一块」，指的却是空气。
    const settingsSteps = ONBOARDING_STEPS.filter((step) =>
      step.route.startsWith('/Settings'),
    );
    // 左边导航项的锚点是按分类 id 拼出来的（见 SettingsPage）。
    // 指这些、或者指整块导航，都不需要先打开哪一栏；其余都在面板里。
    const navTargets = new Set(
      SETTINGS_CATEGORIES.map(
        (category) => `[data-tour="settings-${category.id}"]`,
      ),
    );
    navTargets.add('.settings-nav');
    const pointsIntoPanel = (target: string | null) =>
      Boolean(target) && !navTargets.has(target as string);

    const sectionOf = (route: string) =>
      new URLSearchParams(route.split('?')[1] ?? '').get('section');

    // 一次性摊平成两张清单再比，失败时能直接看出是哪几步坏了
    const badSection = settingsSteps
      .map((step) => [step.id, sectionOf(step.route)] as const)
      .filter(
        ([, section]) => section !== null && !isSettingsCategoryId(section),
      )
      .map(([id, section]) => `${id}: ?section=${section}`);
    const missingSection = settingsSteps
      .filter((step) => pointsIntoPanel(step.target) && !sectionOf(step.route))
      .map((step) => `${step.id} -> ${step.target}`);

    expect(badSection).toEqual([]);
    expect(missingSection).toEqual([]);
  });

  it('后台常驻和快捷键合并指向同一个设置内容区', () => {
    const byId = (id: string) =>
      ONBOARDING_STEPS.find((step) => step.id === id);

    expect(byId('background')?.target).toBe('.settings-content');
    expect(byId('shortcuts')).toBeUndefined();
  });

  it('工作空间首页总会讲，详情步骤只在有工作空间时进入', () => {
    const byId = (id: string) =>
      ONBOARDING_STEPS.find((step) => step.id === id);

    expect(byId('workspace')).toMatchObject({
      route: '/Workspace',
      target: '[data-tour="workspace-home-create"]',
    });
    ['workspaceDetail', 'workspaceNotes'].forEach((id) => {
      expect(byId(id)).toMatchObject({
        route: '/Workspace',
        dynamicRoute: 'firstWorkspace',
      });
    });
  });

  it('要跑真实联动的那一步，卡片得钉在角上', () => {
    // 这一步的聚光灯罩住日历 + 笔记列表一整块，auto 这时会退化成
    // 「贴着某条边居中」，正好压在日历弹出的那个待办清单上。
    ONBOARDING_STEPS.filter((step) => step.hoverDemo).forEach((step) => {
      expect(step.placement).toBe('corner');
      expect(step.target).toBe('.dashboard-main-content');
    });
  });

  it('同一页的步骤是连着走的，不来回跳页', () => {
    // 相邻两步只要路由不同就算一次跳转，跳转次数不该超过页面数
    const jumps = ONBOARDING_STEPS.reduce(
      (count, step, index) =>
        index > 0 && step.route !== ONBOARDING_STEPS[index - 1].route
          ? count + 1
          : count,
      0,
    );
    const pages = new Set(ONBOARDING_STEPS.map((step) => step.route)).size;

    expect(jumps).toBeLessThanOrEqual(pages);
  });
});
