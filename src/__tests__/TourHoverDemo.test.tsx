import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { CalendarWidget } from '../renderer/pages/Dashboard/components/CalendarWidget';
import { NoteListTable } from '../renderer/pages/Dashboard/components/NoteListTable';
import { DashboardNoteItem } from '../renderer/pages/Dashboard/models/DashboardNoteItem';
import { TodoItem } from '../renderer/pages/Dashboard/models/TodoItem';
import TourHoverDemo from '../renderer/onboarding/TourHoverDemo';
import { ONBOARDING_STEPS } from '../renderer/onboarding/OnboardingSteps';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh', resolvedLanguage: 'zh' },
    t: (key: string, options?: Record<string, unknown>) =>
      options?.date ? `${key}:${options.date}` : key,
  }),
}));

const TODAY = '2026-08-21';

const todos = [
  new TodoItem(1, '去银行办对公账号', TODAY, false, 101, '银行'),
  new TodoItem(2, '把纪要发给团队', TODAY, false, 202, '周会'),
];

const specOf = (id: string) =>
  ONBOARDING_STEPS.find((step) => step.id === id)?.hoverDemo as {
    openSelector?: string;
    itemSelector: string;
    maxItems?: number;
  };

const spec = specOf('calendarTodos');
const REVERSE_SPEC = {
  itemSelector: '.notes-table .todo-date-pill',
  maxItems: 3,
};

function renderDemo() {
  const onFocusDate = jest.fn();
  const onFocusTodoNote = jest.fn();
  const view = render(
    <>
      <CalendarWidget
        onFocusDate={onFocusDate}
        onFocusTodoNote={onFocusTodoNote}
        todos={todos}
      />
      <TourHoverDemo spec={spec} />
    </>,
  );
  return { ...view, onFocusDate, onFocusTodoNote };
}

/**
 * 往前拨表。
 *
 * 必须一段一段拨，不能一次拨到位：每一站的定时器是上一站的 effect 提交之后
 * 才挂上去的，而 effect 要等 act 结束才 flush —— 一次性 advance 只会跑掉
 * 已经挂着的那些，后面新挂的通通不响。
 */
const advance = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

const RESET = 800;
const TRAVEL = 520;
const DAY_DWELL = 1150;
const ITEM_DWELL = 1250;

/** 走到「指针已落在那一天、弹窗已展开」这一刻。 */
function runToDay() {
  advance(RESET);
  advance(TRAVEL);
}

/** 再走一站，停到弹窗里的下一条待办上。 */
function runToNextItem(dwell: number) {
  advance(dwell);
  advance(TRAVEL);
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 7, 21, 10, 0, 0));
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * 这段演示的价值全在「它跑的是真东西」：往真实元素上派鼠标事件，弹窗、
 * 高亮、滚动都由应用自己做。所以这里测的不是画了什么，而是那套联动
 * 真的被触发了 —— 哪天 React 改了 onMouseEnter 的合成方式，这里会先红。
 */
describe('引导里的日历联动演示', () => {
  it('指针走到那一天，真的把弹窗打开了', () => {
    const { onFocusDate } = renderDemo();

    // 收手歇一拍 → 指针飞过去 → 落地才派发 mouseover
    runToDay();

    expect(onFocusDate).toHaveBeenLastCalledWith(TODAY);
    expect(
      document.querySelector('.calendar-popover-panel'),
    ).toBeInTheDocument();
  });

  it('接着停到弹窗里的待办上，报出它所属的笔记——右边就是靠这个滚过去的', () => {
    const { onFocusTodoNote } = renderDemo();

    runToDay();
    runToNextItem(DAY_DWELL);

    expect(onFocusTodoNote).toHaveBeenLastCalledWith(101);

    // 再走一条，换成另一篇笔记
    runToNextItem(ITEM_DWELL);

    expect(onFocusTodoNote).toHaveBeenLastCalledWith(202);
  });

  it('一轮走完会收手重来，不会停在最后一条上不动', () => {
    const { onFocusDate } = renderDemo();

    runToDay();
    runToNextItem(DAY_DWELL);
    runToNextItem(ITEM_DWELL);
    onFocusDate.mockClear();
    // 最后一条停够了就收手：弹窗关掉，日期高亮跟着清掉
    advance(ITEM_DWELL);
    advance(300);

    expect(onFocusDate).toHaveBeenLastCalledWith(null);
  });

  it('翻到下一步时必须松手，否则弹窗会一直挂在页面上', () => {
    const onFocusDate = jest.fn();
    // 只卸载演示、页面留着：翻页时真实发生的就是这个，
    // 连页面一起卸载的话弹窗自然就没了，那样断言等于没测
    const { rerender } = render(
      <>
        <CalendarWidget onFocusDate={onFocusDate} todos={todos} />
        <TourHoverDemo spec={spec} />
      </>,
    );

    runToDay();
    expect(onFocusDate).toHaveBeenLastCalledWith(TODAY);

    rerender(<CalendarWidget onFocusDate={onFocusDate} todos={todos} />);
    // 日历离开日期格后延迟 220ms 才收，等它一下
    advance(300);

    expect(document.querySelector('.calendar-popover-panel')).toBeNull();
    expect(onFocusDate).toHaveBeenLastCalledWith(null);
  });

  it('那天没待办就不硬演，直接进入下一轮', () => {
    const onFocusTodoNote = jest.fn();
    render(
      <>
        <CalendarWidget onFocusTodoNote={onFocusTodoNote} todos={[]} />
        <TourHoverDemo spec={spec} />
      </>,
    );

    runToDay();
    runToNextItem(DAY_DWELL);

    // 日历上根本没有带圆点的日子，演示不该硬凑出一条待办来
    expect(
      onFocusTodoNote.mock.calls.filter(([id]) => id !== null),
    ).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * 反过来那一步：手停在右边列表的「待办日期」上，亮的是左边日历。
 * 同一个演示组件，只是不需要先展开什么，直接一格一格走。
 */
describe('引导里的反向联动演示', () => {
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

  const renderReverse = () => {
    const onHoverTodoDates = jest.fn();
    render(
      <>
        <NoteListTable
          notes={[makeNote(1, '会议记录'), makeNote(2, '客户接待')]}
          onCategoryChange={() => {}}
          onDelete={() => {}}
          onHoverTodoDates={onHoverTodoDates}
          onSearchChange={() => {}}
          onSelectNote={() => {}}
          onTogglePin={() => {}}
          searchQuery=""
          selectedCategory="all"
          todos={[
            new TodoItem(11, '准备材料', '2026-08-22', false, 1),
            new TodoItem(12, '联系物流', '2026-08-25', false, 2),
          ]}
        />
        <TourHoverDemo spec={REVERSE_SPEC} />
      </>,
    );
    return onHoverTodoDates;
  };

  beforeEach(() => {
    // jsdom 没实现 Element.scrollTo，列表里会用到
    Element.prototype.scrollTo = jest.fn() as never;
  });

  it('停在日期药丸上，把那条笔记的日期报给日历——日历就是靠这个闪的', () => {
    const onHoverTodoDates = renderReverse();

    // 这一步没有「先展开」的动作，第一站就是第一颗药丸
    advance(RESET);
    advance(TRAVEL);

    expect(onHoverTodoDates).toHaveBeenLastCalledWith(['2026-08-22']);
  });

  it('接着走下一行，报的是另一条笔记的日期', () => {
    const onHoverTodoDates = renderReverse();

    advance(RESET);
    advance(TRAVEL);
    advance(ITEM_DWELL);
    advance(TRAVEL);

    expect(onHoverTodoDates).toHaveBeenLastCalledWith(['2026-08-25']);
  });

  it('翻到下一步时松手，日历上的闪烁得停下来', () => {
    const onHoverTodoDates = jest.fn();
    const table = (
      <NoteListTable
        notes={[makeNote(1, '会议记录')]}
        onCategoryChange={() => {}}
        onDelete={() => {}}
        onHoverTodoDates={onHoverTodoDates}
        onSearchChange={() => {}}
        onSelectNote={() => {}}
        onTogglePin={() => {}}
        searchQuery=""
        selectedCategory="all"
        todos={[new TodoItem(11, '准备材料', '2026-08-22', false, 1)]}
      />
    );
    const { rerender } = render(
      <>
        {table}
        <TourHoverDemo spec={REVERSE_SPEC} />
      </>,
    );

    advance(RESET);
    advance(TRAVEL);
    expect(onHoverTodoDates).toHaveBeenLastCalledWith(['2026-08-22']);

    // 只卸载演示，列表留着 —— 翻页时真实发生的就是这个
    rerender(table);

    expect(onHoverTodoDates).toHaveBeenLastCalledWith(null);
  });
});
