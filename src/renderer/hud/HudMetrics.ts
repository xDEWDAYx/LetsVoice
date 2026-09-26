/**
 * 浮窗要展示的四项统计，以及环形图需要的几何量。
 *
 * 纯计算放这儿：环形的进度算错、数字被截断这类问题，直接写断言最省事。
 */

export type HudMetricKey = 'notes' | 'pinned' | 'todos' | 'words';

export type HudMetric = {
  key: HudMetricKey;
  value: number;
  /** 0–1，环填多少。四项量纲不同，各自按自己的参考基数归一。 */
  ratio: number;
  labelKey: string;
};

export type HudMetricInput = {
  notes: number;
  pinned: number;
  todos: number;
  words: number;
};

/**
 * 每项的「满环」参考值。
 *
 * 四个数字量纲完全不同（篇 / 条 / 字），画成一个饼是没有意义的，
 * 所以做成四个独立的环：各自相对一个参考基数，看的是「多不多」而不是占比。
 * 超过基数就填满，不会画出一个转两圈的环。
 */
export const HUD_METRIC_SCALES: Record<HudMetricKey, number> = {
  notes: 50,
  pinned: 10,
  todos: 20,
  words: 20000,
};

export function buildHudMetrics(input: HudMetricInput): HudMetric[] {
  const entries: Array<[HudMetricKey, number, string]> = [
    ['notes', input.notes, 'hud.stats.notes'],
    ['pinned', input.pinned, 'hud.stats.pinned'],
    ['todos', input.todos, 'hud.stats.todos'],
    ['words', input.words, 'hud.stats.words'],
  ];

  return entries.map(([key, rawValue, labelKey]) => {
    const value = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 0;
    const scale = HUD_METRIC_SCALES[key];
    return {
      key,
      value,
      ratio: Math.max(0, Math.min(1, value / scale)),
      labelKey,
    };
  });
}

/** 大数字压成 1.2k / 3.4w，环里塞不下 12,345 这种长度。 */
export function formatHudNumber(value: number, language: string): string {
  if (value < 1000) return String(value);
  if (language.startsWith('zh')) {
    if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
    return `${(value / 10000).toFixed(1)}w`;
  }
  if (value < 1000000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1000000).toFixed(1)}m`;
}

/** 环形进度条的 stroke-dasharray：已填长度 + 剩余长度。 */
export function ringDashArray(ratio: number, radius: number): string {
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * Math.max(0, Math.min(1, ratio));
  return `${filled} ${circumference - filled}`;
}

/** dashboard overview 里跟统计有关的那几个字段。 */
export type HudMetricSource = {
  notes?: Array<{ isPinned?: boolean; transcript?: string | null }>;
  todos?: Array<{ isCompleted?: boolean }>;
} | null;

/**
 * 从 dashboard overview 算出四项指标。
 *
 * 统计浮窗和新手引导里那个演示浮窗共用这一套口径：引导要展示的就是
 * 用户自己的数据，两边各算一遍迟早会算出不一样的数。
 */
export function metricsFromOverview(overview: HudMetricSource): HudMetric[] {
  const notes = overview?.notes ?? [];
  const todos = overview?.todos ?? [];
  return buildHudMetrics({
    notes: notes.length,
    pinned: notes.filter((note) => note.isPinned).length,
    todos: todos.filter((todo) => !todo.isCompleted).length,
    words: notes.reduce(
      (total, note) => total + (note.transcript?.length ?? 0),
      0,
    ),
  });
}

/** 四项全是 0（刚装好的应用就是这样），引导里得换成示例数据才讲得清。 */
export function hasAnyMetric(metrics: HudMetric[]): boolean {
  return metrics.some((metric) => metric.value > 0);
}
