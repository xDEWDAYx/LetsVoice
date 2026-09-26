import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NoteListTable } from '../renderer/pages/Dashboard/components/NoteListTable';
import { DashboardNoteItem } from '../renderer/pages/Dashboard/models/DashboardNoteItem';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh', resolvedLanguage: 'zh' },
    t: (key: string) => key,
  }),
}));

const notes = [
  new DashboardNoteItem(
    1,
    1,
    '会议记录',
    null,
    '转录内容',
    false,
    null,
    new Date('2026-08-18T00:00:00.000Z'),
    new Date('2026-08-18T00:00:00.000Z'),
    'meeting',
  ),
];

type Overrides = {
  searchQuery?: string;
  selectedCategory?: 'all' | 'meeting';
  onSearchChange?: (query: string) => void;
  onCategoryChange?: (category: string) => void;
};

const renderTable = (overrides: Overrides = {}) =>
  render(
    <NoteListTable
      notes={notes}
      todos={[]}
      searchQuery={overrides.searchQuery ?? ''}
      onSearchChange={overrides.onSearchChange ?? (() => {})}
      selectedCategory={overrides.selectedCategory ?? 'all'}
      onCategoryChange={(overrides.onCategoryChange ?? (() => {})) as never}
      onTogglePin={() => {}}
      onSelectNote={() => {}}
      onDelete={() => {}}
    />,
  );

describe('表头里的搜索', () => {
  it('平时不占地方，点了列名才出输入框', () => {
    renderTable();

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('dashboard.notes.column.title'));

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('输入的内容报给上层做筛选', () => {
    const onSearchChange = jest.fn();
    renderTable({ onSearchChange });

    fireEvent.click(screen.getByText('dashboard.notes.column.title'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '银行' },
    });

    expect(onSearchChange).toHaveBeenCalledWith('银行');
  });

  it('按 Esc 收起输入框，已输入的词仍挂在列名旁边', () => {
    renderTable({ searchQuery: '银行' });

    fireEvent.click(screen.getByText('dashboard.notes.column.title'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('银行')).toBeInTheDocument();
  });
});

describe('表头里的类型筛选', () => {
  it('点类型列出下拉，选中的项报给上层', () => {
    const onCategoryChange = jest.fn();
    renderTable({ onCategoryChange });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('dashboard.notes.column.type'));
    // 行里的类型徽章也是这几个字，限定在下拉里找
    fireEvent.click(
      within(screen.getByRole('listbox')).getByText(
        'dashboard.category.meeting',
      ),
    );

    expect(onCategoryChange).toHaveBeenCalledWith('meeting');
    // 选完就收起来
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('点别处会关掉下拉', () => {
    renderTable();

    fireEvent.click(screen.getByText('dashboard.notes.column.type'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('清除筛选', () => {
  it('没有筛选时不出现', () => {
    renderTable();

    expect(
      screen.queryByText(/dashboard.notes.filter.reset/),
    ).not.toBeInTheDocument();
  });

  it('一键把搜索词和类型都恢复成默认', () => {
    const onSearchChange = jest.fn();
    const onCategoryChange = jest.fn();
    renderTable({
      searchQuery: '银行',
      selectedCategory: 'meeting',
      onSearchChange,
      onCategoryChange,
    });

    fireEvent.click(screen.getByText(/dashboard.notes.filter.reset/));

    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(onCategoryChange).toHaveBeenCalledWith('all');
  });
});

describe('更聪明的搜索交互', () => {
  it('按 / 直接唤起搜索，不用先去点列名', () => {
    renderTable();

    fireEvent.keyDown(document, { key: '/' });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('Ctrl+F 也能唤起', () => {
    renderTable();

    fireEvent.keyDown(document, { key: 'f', ctrlKey: true });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('已经在输入框里打字时，/ 不被抢走', () => {
    renderTable();
    fireEvent.click(screen.getByText('dashboard.notes.column.title'));
    const input = screen.getByRole('textbox');
    const prevented = !fireEvent.keyDown(input, { key: '/' });

    expect(prevented).toBe(false);
  });

  it('点到别处就收起搜索框（叉号已经去掉了）', () => {
    renderTable({ searchQuery: '银行' });
    fireEvent.click(screen.getByText('dashboard.notes.column.title'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('命中的词在行里高亮出来', () => {
    const { container } = renderTable({ searchQuery: '会议' });

    const marks = container.querySelectorAll('mark.search-hit');
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]).toHaveTextContent('会议');
  });
});

describe('表头的视觉重量', () => {
  it('列名触发器跳过全局按钮外观，不然表头看着像塞了几个按钮', () => {
    const { container } = renderTable();

    const triggers = container.querySelectorAll('.th-button');
    expect(triggers.length).toBeGreaterThan(0);
    // .btn-plain 是本项目跳过全局胶囊底 / 内高光 / 扫光的约定
    triggers.forEach((trigger) => {
      expect(trigger).toHaveClass('btn-plain');
    });
  });

  it('下拉项和清除按钮同样不套全局按钮外观', () => {
    const { container } = renderTable({
      searchQuery: '银行',
      selectedCategory: 'meeting',
    });

    fireEvent.click(screen.getByText('dashboard.notes.column.type'));

    container
      .querySelectorAll('.th-menu-item, .filters-reset, .clear-search')
      .forEach((node) => expect(node).toHaveClass('btn-plain'));
  });

  it('列名是可下划线的文字节点，图标只是旁边的弱提示', () => {
    const { container } = renderTable();

    const label = container.querySelector('.th-button .th-label');
    expect(label).toHaveTextContent('dashboard.notes.column.title');
    // 提示图标是 svg，不是彩色 emoji
    expect(container.querySelector('.th-affordance')?.tagName).toBe('svg');
  });
});

describe('类型下拉不被表格容器裁掉', () => {
  it('用 fixed 定位并带上算好的坐标——absolute 会被滚动容器裁没', () => {
    const { container } = renderTable();

    fireEvent.click(screen.getByText('dashboard.notes.column.type'));

    const menu = container.querySelector('.th-menu') as HTMLElement;
    expect(menu).not.toBeNull();
    // 坐标写在 style 上（jsdom 里 rect 全是 0，落到左上角的安全边距）
    expect(menu.style.top).not.toBe('');
    expect(menu.style.left).not.toBe('');
  });

  it('表格滚动时收起，免得菜单悬在半空', () => {
    const { container } = renderTable();
    fireEvent.click(screen.getByText('dashboard.notes.column.type'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.scroll(container.querySelector('.table-responsive')!);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('再点一次列名收起下拉', () => {
    renderTable();
    const trigger = screen.getByText('dashboard.notes.column.type');

    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
