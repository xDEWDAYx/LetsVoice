import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { NoteListTable } from '../renderer/pages/Dashboard/components/NoteListTable';
import { DashboardNoteItem } from '../renderer/pages/Dashboard/models/DashboardNoteItem';
import { TodoItem } from '../renderer/pages/Dashboard/models/TodoItem';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh', resolvedLanguage: 'zh' },
    t: (key: string) => key,
  }),
}));

const makeNote = (id: number, name: string) =>
  new DashboardNoteItem(
    id,
    1,
    name,
    null,
    `${name} 的转录内容`,
    false,
    null,
    new Date('2026-08-18T00:00:00.000Z'),
    new Date('2026-08-18T00:00:00.000Z'),
    'meeting',
  );

const notes = [makeNote(1, '会议记录'), makeNote(2, '客户接待')];
const todos = [
  new TodoItem(11, '准备材料', '2026-08-22', false, 1),
  new TodoItem(12, '联系物流', '2026-08-25', false, 2),
];

const renderTable = (flashDate: string | null) =>
  render(
    <NoteListTable
      notes={notes}
      todos={todos}
      searchQuery=""
      onSearchChange={() => {}}
      selectedCategory="all"
      onCategoryChange={() => {}}
      onTogglePin={() => {}}
      onSelectNote={() => {}}
      onDelete={() => {}}
      flashDate={flashDate}
    />,
  );

const rowOf = (title: string) => screen.getByText(title).closest('tr');

// jsdom 没实现 Element.scrollTo，补一个假的好断言调用参数。
beforeEach(() => {
  Element.prototype.scrollTo = jest.fn() as never;
});

describe('日历日期联动笔记列表', () => {
  it('只闪烁当天有待办的那条笔记', () => {
    renderTable('2026-08-22');

    expect(rowOf('会议记录')).toHaveClass('is-flash-target');
    expect(rowOf('客户接待')).not.toHaveClass('is-flash-target');
  });

  it('没有悬停日期时谁都不闪', () => {
    renderTable(null);

    expect(rowOf('会议记录')).not.toHaveClass('is-flash-target');
    expect(rowOf('客户接待')).not.toHaveClass('is-flash-target');
  });

  it('日期上没有任何待办时也不闪', () => {
    renderTable('2026-08-30');

    expect(rowOf('会议记录')).not.toHaveClass('is-flash-target');
    expect(rowOf('客户接待')).not.toHaveClass('is-flash-target');
  });
});

/**
 * jsdom 不做布局，所有 getBoundingClientRect 都是 0。
 * 这里手工摆出「命中的行被滚到看不见的地方」这种几何关系，
 * 验证边缘发光的判断逻辑，而不是验证浏览器的排版。
 */
const stubRect = (element: Element, top: number, bottom: number) => {
  jest
    .spyOn(element, 'getBoundingClientRect')
    .mockReturnValue({ top, bottom, height: bottom - top } as DOMRect);
};

describe('命中的笔记不在可视范围内时的边缘提示', () => {
  const setup = (rowTop: number, rowBottom: number) => {
    const { container } = renderTable('2026-08-22');
    const section = container.querySelector('.note-list-section')!;
    const scroller = container.querySelector('.table-responsive')!;
    const head = container.querySelector('thead')!;
    const row = rowOf('会议记录')!;

    // 可视区 100~300，表头占到 130
    stubRect(scroller, 100, 300);
    stubRect(head, 100, 130);
    stubRect(row, rowTop, rowBottom);

    // 滚动会触发重新测量，用它把 stub 的几何关系喂进去
    fireEvent.scroll(scroller);
    return section;
  };

  it('行被滚到表头上方时，顶部边缘发光', () => {
    const section = setup(40, 80);

    expect(section).toHaveClass('has-flash-above');
    expect(section).not.toHaveClass('has-flash-below');
  });

  it('行在下方看不见时，底部边缘发光', () => {
    const section = setup(360, 400);

    expect(section).toHaveClass('has-flash-below');
    expect(section).not.toHaveClass('has-flash-above');
  });

  it('行本来就看得见时，两条边都不发光', () => {
    const section = setup(180, 220);

    expect(section).not.toHaveClass('has-flash-above');
    expect(section).not.toHaveClass('has-flash-below');
  });

  it('被表头挡住一半仍算看得见，不必提示', () => {
    const section = setup(120, 160);

    expect(section).not.toHaveClass('has-flash-above');
    expect(section).not.toHaveClass('has-flash-below');
  });
});

describe('弹窗里悬停单条待办', () => {
  const renderWithFocus = (
    focusNoteId: number | null,
    extra: TodoItem[] = [],
  ) =>
    render(
      <NoteListTable
        notes={notes}
        todos={[...todos, ...extra]}
        searchQuery=""
        onSearchChange={() => {}}
        selectedCategory="all"
        onCategoryChange={() => {}}
        onTogglePin={() => {}}
        onSelectNote={() => {}}
        onDelete={() => {}}
        flashDate="2026-08-22"
        focusNoteId={focusNoteId}
      />,
    );

  it('收窄成只闪这一条，同一天的其它笔记不再跟着闪', () => {
    // 两条笔记都在 08-22 有待办，只有被指定的那条该闪
    renderWithFocus(2, [
      new TodoItem(13, '同一天的另一件事', '2026-08-22', false, 2),
    ]);

    expect(rowOf('客户接待')).toHaveClass('is-flash-target');
    expect(rowOf('会议记录')).not.toHaveClass('is-flash-target');
  });

  it('把那一行滚进视野，并且不出上下边缘提示线', () => {
    const view = renderWithFocus(null);
    const section = view.container.querySelector('.note-list-section')!;
    const scroller = view.container.querySelector(
      '.table-responsive',
    )! as HTMLElement;
    const head = view.container.querySelector('thead')!;
    const row = rowOf('会议记录')!;

    // 可视区 100~300（表头占到 130），目标行在下方 60px 处看不见
    stubRect(scroller, 100, 300);
    stubRect(head, 100, 130);
    stubRect(row, 320, 360);
    scroller.scrollTop = 40;
    (scroller.scrollTo as jest.Mock).mockClear();

    view.rerender(
      <NoteListTable
        notes={notes}
        todos={todos}
        searchQuery=""
        onSearchChange={() => {}}
        selectedCategory="all"
        onCategoryChange={() => {}}
        onTogglePin={() => {}}
        onSelectNote={() => {}}
        onDelete={() => {}}
        flashDate="2026-08-22"
        focusNoteId={1}
      />,
    );

    // 行底 360 超出可视区底 300，加 8px 余量 → 往下滚 68
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 108,
      behavior: 'smooth',
    });
    // 已经滚过去了，就不该再用边缘线提示
    expect(section).not.toHaveClass('has-flash-above');
    expect(section).not.toHaveClass('has-flash-below');
  });

  it('要闪的行本来就看得见时，不做多余的滚动', () => {
    const view = renderWithFocus(null);
    const scroller = view.container.querySelector(
      '.table-responsive',
    )! as HTMLElement;
    const head = view.container.querySelector('thead')!;
    const row = rowOf('会议记录')!;

    stubRect(scroller, 100, 300);
    stubRect(head, 100, 130);
    stubRect(row, 180, 220);
    (scroller.scrollTo as jest.Mock).mockClear();

    view.rerender(
      <NoteListTable
        notes={notes}
        todos={todos}
        searchQuery=""
        onSearchChange={() => {}}
        selectedCategory="all"
        onCategoryChange={() => {}}
        onTogglePin={() => {}}
        onSelectNote={() => {}}
        onDelete={() => {}}
        flashDate="2026-08-22"
        focusNoteId={1}
      />,
    );

    expect(scroller.scrollTo).not.toHaveBeenCalled();
  });
});
