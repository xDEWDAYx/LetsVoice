import { computeHudBounds, HUD_SIZES } from '../main/background/HudWindow';
import {
  buildHudMetrics,
  formatHudNumber,
  ringDashArray,
} from '../renderer/hud/HudMetrics';
import {
  hudTodoCount,
  nextDateKey,
  selectHudTodos,
  toDateKey,
  HudTodo,
} from '../renderer/hud/HudTodoSelection';

const fullHd = { x: 0, y: 0, width: 1920, height: 1040 };

describe('浮窗落点', () => {
  it('统计和待办贴右下角，留出边距', () => {
    const stats = computeHudBounds('stats', fullHd);

    expect(stats.x + stats.width).toBe(1920 - 18);
    expect(stats.y + stats.height).toBe(1040 - 18);
  });

  it('录音条水平居中、靠屏幕下方，不挡住手上的活', () => {
    const record = computeHudBounds('record', fullHd);

    expect(record.x + record.width / 2).toBe(960);
    // 紧贴工作区下沿（任务栏上方），不再吊在半空
    expect(record.y + record.height).toBe(1040);
    // 是一条小胶囊，不是一个大方块
    expect(record.height).toBeLessThan(60);
    expect(record.width).toBeLessThan(200);
  });

  it('工作区比录音条还矮时顶到上沿，不会跑出画面', () => {
    // 胶囊 52 高，这块工作区只有 40
    const shortScreen = { x: 0, y: 0, width: 1280, height: 40 };
    const record = computeHudBounds('record', shortScreen);

    expect(record.y).toBe(0);
    expect(record.height).toBeLessThanOrEqual(40);
  });

  it('工作区有上偏移时（比如任务栏在顶部）也贴的是工作区下沿', () => {
    const taskbarOnTop = { x: 0, y: 48, width: 1920, height: 992 };
    const record = computeHudBounds('record', taskbarOnTop);

    expect(record.y + record.height).toBe(48 + 992);
  });

  it('按工作区算，不会压在任务栏上', () => {
    // 任务栏在下方占 60px：工作区高度变小，浮窗跟着往上挪
    const withTaskbar = { x: 0, y: 0, width: 1920, height: 980 };
    const stats = computeHudBounds('stats', withTaskbar);

    expect(stats.y + stats.height).toBe(980 - 18);
  });

  it('副屏有偏移时也落在那块屏幕上', () => {
    const secondScreen = { x: 1920, y: 0, width: 1280, height: 720 };
    const todos = computeHudBounds('todos', secondScreen);

    expect(todos.x).toBeGreaterThanOrEqual(1920);
    expect(todos.x + todos.width).toBe(1920 + 1280 - 18);
  });

  it('屏幕比浮窗还窄时收缩到屏幕内，不会跑到画面外', () => {
    // 胶囊 176 宽，这块屏幕只有 120
    const tiny = { x: 0, y: 0, width: 120, height: 150 };
    const record = computeHudBounds('record', tiny);

    expect(record.width).toBe(120);
    expect(record.x).toBe(0);
    expect(record.y + record.height).toBeLessThanOrEqual(150);
  });

  it('三种浮窗各有自己的尺寸', () => {
    expect(HUD_SIZES.todos.height).toBeGreaterThan(HUD_SIZES.stats.height);
  });
});

describe('统计环', () => {
  it('四项都算出来，比例按各自的参考基数归一', () => {
    const metrics = buildHudMetrics({
      notes: 25,
      pinned: 5,
      todos: 10,
      words: 10000,
    });

    expect(metrics.map((metric) => metric.key)).toEqual([
      'notes',
      'pinned',
      'todos',
      'words',
    ]);
    expect(metrics.every((metric) => metric.ratio === 0.5)).toBe(true);
  });

  it('超过基数就填满，不会画出转两圈的环', () => {
    const [notes] = buildHudMetrics({
      notes: 999,
      pinned: 0,
      todos: 0,
      words: 0,
    });

    expect(notes.ratio).toBe(1);
  });

  it('异常数值当作 0，不让 NaN 画到 svg 上', () => {
    const [notes] = buildHudMetrics({
      notes: Number.NaN,
      pinned: -3,
      todos: 0,
      words: 0,
    });

    expect(notes.value).toBe(0);
    expect(notes.ratio).toBe(0);
  });

  it('dasharray 的两段加起来正好是周长', () => {
    const [filled, rest] = ringDashArray(0.25, 10).split(' ').map(Number);

    expect(filled + rest).toBeCloseTo(2 * Math.PI * 10);
    expect(filled).toBeCloseTo((2 * Math.PI * 10) / 4);
  });

  it('大数字压缩，环里塞得下', () => {
    expect(formatHudNumber(998, 'zh')).toBe('998');
    expect(formatHudNumber(1200, 'zh')).toBe('1.2k');
    expect(formatHudNumber(23400, 'zh')).toBe('2.3w');
    expect(formatHudNumber(23400, 'en')).toBe('23.4k');
  });
});

describe('待办浮窗的筛选', () => {
  const todo = (id: number, dateString: string, extra = {}): HudTodo => ({
    id,
    noteId: 1,
    title: `事项 ${id}`,
    dateString,
    isCompleted: false,
    ...extra,
  });

  it('只留今天和明天', () => {
    const group = selectHudTodos(
      [
        todo(1, '2026-08-19'),
        todo(2, '2026-08-21'),
        todo(3, '2026-08-22'),
        todo(4, '2026-08-25'),
      ],
      '2026-08-21',
    );

    expect(group.today.map((item) => item.id)).toEqual([2]);
    expect(group.tomorrow.map((item) => item.id)).toEqual([3]);
    // 逾期的和更远的都不列——浮窗放不下，列了会把今天的挤下去
    expect(hudTodoCount(group)).toBe(2);
  });

  it('已完成的不占位置', () => {
    const group = selectHudTodos(
      [todo(1, '2026-08-21', { isCompleted: true }), todo(2, '2026-08-21')],
      '2026-08-21',
    );

    expect(hudTodoCount(group)).toBe(1);
  });

  it('重复待办展开出的同名同日记录只留一条', () => {
    const daily = [1, 2, 3].map((id) => ({
      ...todo(id, '2026-08-21'),
      title: '每天写日报',
    }));

    expect(hudTodoCount(selectHudTodos(daily, '2026-08-21'))).toBe(1);
  });

  it('跨月也能算对明天', () => {
    expect(nextDateKey('2026-08-31')).toBe('2026-09-01');
    expect(nextDateKey('2026-12-31')).toBe('2027-01-01');
    // 闰年 2 月
    expect(nextDateKey('2028-02-28')).toBe('2028-02-29');
  });

  it('月末当天也能取到明天那组', () => {
    const group = selectHudTodos(
      [todo(1, '2026-08-31'), todo(2, '2026-09-01')],
      '2026-08-31',
    );

    expect(group.today.map((item) => item.id)).toEqual([1]);
    expect(group.tomorrow.map((item) => item.id)).toEqual([2]);
  });

  it('toDateKey 按本地时区补零', () => {
    expect(toDateKey(new Date(2026, 7, 3))).toBe('2026-08-03');
  });
});
