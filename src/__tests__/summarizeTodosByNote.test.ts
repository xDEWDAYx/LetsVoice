import { summarizeTodosByNote } from '../renderer/pages/Dashboard/components/NoteListTable';
import { TodoItem } from '../renderer/pages/Dashboard/models/TodoItem';

/**
 * 仪表盘笔记列表里的「待办日期」列。
 * 重复待办会展开成很多行，这一列必须收敛成一个代表日期 + 计数。
 */

const TODAY = '2026-08-20';

let nextId = 1;
function todo(noteId: number | undefined, date: string): TodoItem {
  nextId += 1;
  return new TodoItem(nextId, `任务 ${nextId}`, date, false, noteId);
}

describe('summarizeTodosByNote', () => {
  it('没有待办的笔记不会出现在结果里', () => {
    expect(summarizeTodosByNote([], TODAY).size).toBe(0);
  });

  it('取最近一个还没到的日期作为主显', () => {
    const result = summarizeTodosByNote(
      [todo(1, '2026-08-31'), todo(1, '2026-08-24'), todo(1, '2026-09-10')],
      TODAY,
    );
    expect(result.get(1)?.primary).toBe('2026-08-24');
    expect(result.get(1)?.overdue).toBe(false);
    expect(result.get(1)?.extraCount).toBe(2);
  });

  it('当天的待办算「还没到」，不算过期', () => {
    const result = summarizeTodosByNote([todo(1, TODAY)], TODAY);
    expect(result.get(1)?.primary).toBe(TODAY);
    expect(result.get(1)?.overdue).toBe(false);
  });

  it('全部过期时取最后一个，并标记为过期', () => {
    const result = summarizeTodosByNote(
      [todo(1, '2026-08-01'), todo(1, '2026-08-10')],
      TODAY,
    );
    expect(result.get(1)?.primary).toBe('2026-08-10');
    expect(result.get(1)?.overdue).toBe(true);
  });

  it('同一天的多条待办只算一个日期', () => {
    const result = summarizeTodosByNote(
      [todo(1, '2026-08-24'), todo(1, '2026-08-24')],
      TODAY,
    );
    expect(result.get(1)?.extraCount).toBe(0);
    expect(result.get(1)?.allDates).toEqual(['2026-08-24']);
  });

  it('重复待办展开成 91 条也只显示一个日期加计数', () => {
    const daily = Array.from({ length: 91 }, (_, index) => {
      const day = new Date(2026, 7, 20);
      day.setDate(day.getDate() + index);
      return todo(1, day.toISOString().slice(0, 10));
    });

    const summary = summarizeTodosByNote(daily, TODAY).get(1);
    expect(summary?.primary).toBe(TODAY);
    expect(summary?.extraCount).toBe(90);
  });

  it('按笔记分组，互不串味', () => {
    const result = summarizeTodosByNote(
      [todo(1, '2026-08-24'), todo(2, '2026-09-04')],
      TODAY,
    );
    expect(result.get(1)?.primary).toBe('2026-08-24');
    expect(result.get(2)?.primary).toBe('2026-09-04');
  });

  it('没有关联笔记的待办直接忽略', () => {
    expect(
      summarizeTodosByNote([todo(undefined, '2026-08-24')], TODAY).size,
    ).toBe(0);
  });

  it('带时间戳的日期只取前十位', () => {
    const result = summarizeTodosByNote(
      [todo(1, '2026-08-24T00:00:00.000Z')],
      TODAY,
    );
    expect(result.get(1)?.primary).toBe('2026-08-24');
  });
});
