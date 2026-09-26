/**
 * 浮窗要列哪些待办。
 *
 * 纯函数：日期边界、逾期与今日的排序、条数上限，都是容易出错又容易测的地方。
 */

export type HudTodo = {
  id: number;
  noteId: number;
  title: string;
  dateString: string;
  isCompleted: boolean;
  isPinned?: boolean;
  noteTitle?: string;
};

export type HudTodoGroup = {
  today: HudTodo[];
  tomorrow: HudTodo[];
};

export function toDateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 把日期字符串往后推一天，用来算「明天」。 */
export function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  // 用本地时间构造，跨月跨年由 Date 自己处理
  return toDateKey(new Date(year, month - 1, day + 1));
}

/**
 * 只取今天和明天。
 *
 * 浮窗是「瞥一眼就走」的东西：逾期的已经过去了、下周的还早，
 * 列出来只会把真正要做的那两三条挤下去。已完成的同理不列。
 * 重复待办被展开成很多条同名记录，同一天同一件事只留一条。
 */
export function selectHudTodos(todos: HudTodo[], today: string): HudTodoGroup {
  const seen = new Set<string>();
  const pending = todos.filter((todo) => {
    if (todo.isCompleted) return false;
    const date = (todo.dateString ?? '').slice(0, 10);
    if (!date) return false;
    const fingerprint = `${todo.title.trim().toLowerCase()}@${date}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });

  const tomorrow = nextDateKey(today);
  // 置顶的排在本组最前；其余保持原有顺序
  const onDate = (date: string) =>
    pending
      .filter((todo) => todo.dateString.slice(0, 10) === date)
      .sort(
        (a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)),
      );

  return { today: onDate(today), tomorrow: onDate(tomorrow) };
}

export function hudTodoCount(group: HudTodoGroup): number {
  return group.today.length + group.tomorrow.length;
}

/** dashboard overview 里跟待办有关的那几个字段。 */
export type HudTodoSource = {
  notes?: Array<{ id: number; name?: string }>;
  todos?: Array<{
    id: number;
    noteId: number;
    title: string;
    dateString: string;
    isCompleted: boolean;
    isPinned?: boolean | number;
  }>;
} | null;

/**
 * 把 overview 摊平成浮窗要的待办行（顺带把笔记标题接上）。
 *
 * 待办浮窗和新手引导里那个演示浮窗共用这一段：引导展示的是用户自己的待办，
 * 两边各写一遍，字段接错了只有在引导里才看得出来。
 */
export function todosFromOverview(overview: HudTodoSource): HudTodo[] {
  const noteName = new Map<number, string>(
    (overview?.notes ?? []).map((note) => [note.id, note.name ?? '']),
  );
  return (overview?.todos ?? []).map((todo) => ({
    id: todo.id,
    noteId: todo.noteId,
    title: todo.title,
    dateString: todo.dateString,
    isCompleted: todo.isCompleted,
    isPinned: Boolean(todo.isPinned),
    noteTitle: noteName.get(todo.noteId),
  }));
}
