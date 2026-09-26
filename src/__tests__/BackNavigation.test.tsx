import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  DEFAULT_BACK_PATH,
  backLabelKey,
  readBackPath,
} from '../renderer/router/BackNavigation';
import WorkspaceDetailHeader from '../renderer/pages/Workspace/components/WorkspaceDetailHeader';
import { RouteManager } from '../renderer/router/RouteManager';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh', resolvedLanguage: 'zh' },
    t: (key: string, options?: Record<string, unknown>) =>
      options?.page ? `${key}:${options.page}` : key,
  }),
}));

describe('readBackPath', () => {
  it('用跳转时留下的来源路径', () => {
    expect(readBackPath({ from: '/DashBoard' })).toBe('/DashBoard');
  });

  it('没有来源时退回默认页', () => {
    expect(readBackPath(null)).toBe(DEFAULT_BACK_PATH);
    expect(readBackPath({})).toBe(DEFAULT_BACK_PATH);
    expect(readBackPath({ from: 42 })).toBe(DEFAULT_BACK_PATH);
  });

  it('只认站内路径，站外地址一律不跟', () => {
    // history state 是可写的，别把它当可信输入
    expect(readBackPath({ from: 'https://example.com' })).toBe(
      DEFAULT_BACK_PATH,
    );
    expect(readBackPath({ from: '//example.com' })).toBe(DEFAULT_BACK_PATH);
    expect(readBackPath({ from: 'DashBoard' })).toBe(DEFAULT_BACK_PATH);
  });

  it('调用方可以指定自己的兜底页', () => {
    expect(readBackPath(null, '/Settings')).toBe('/Settings');
  });
});

describe('backLabelKey', () => {
  it('认识的页面给出侧边栏里的名字', () => {
    expect(backLabelKey('/DashBoard')).toBe('sidebar.dashBoard');
    expect(backLabelKey('/Settings')).toBe('sidebar.settings');
    expect(backLabelKey('/')).toBe('sidebar.transcription');
  });

  it('叫不出名字的路径返回 null，按钮就只写「返回」', () => {
    expect(backLabelKey('/Workspace/12')).toBeNull();
  });
});

const workspace = {
  id: 1,
  name: '会议',
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
  last_opened_at: null,
  recent_at: '2026-08-20T00:00:00.000Z',
  note_count: 20,
  pinned_count: 0,
};

const renderHeader = (state: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/Workspace/1', state }]}>
      <WorkspaceDetailHeader
        workspace={workspace}
        onRename={() => {}}
        onDelete={() => {}}
      />
    </MemoryRouter>,
  );

describe('工作空间详情页的返回按钮', () => {
  it('从仪表板点进来就回仪表板，并写明回哪去', () => {
    renderHeader({ from: '/DashBoard' });

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/DashBoard');
    expect(link).toHaveTextContent('workspace.detail.backTo:sidebar.dashBoard');
  });

  it('从设置页点进来就回设置页', () => {
    renderHeader({ from: '/Settings' });

    expect(screen.getByRole('link')).toHaveAttribute('href', '/Settings');
  });

  it('直接打开（没有来源）时回工作空间列表', () => {
    renderHeader(undefined);

    expect(screen.getByRole('link')).toHaveAttribute('href', DEFAULT_BACK_PATH);
  });
});

describe('RouteManager 记录来源', () => {
  it('跳转时把当前页写进 state.from', () => {
    const navigate = jest.fn();
    const manager = new RouteManager(navigate, '/DashBoard');

    manager.navigateToWorkspace(7);

    expect(navigate).toHaveBeenCalledWith('/Workspace/7', {
      state: { from: '/DashBoard' },
    });
  });

  it('不覆盖调用方自己带的 state', () => {
    const navigate = jest.fn();
    const manager = new RouteManager(navigate, '/DashBoard');

    manager.navigateToTranscription({ state: { noteId: 3 } });

    expect(navigate).toHaveBeenCalledWith('/Transcription', {
      state: { from: '/DashBoard', noteId: 3 },
    });
  });

  it('没告诉它当前在哪时，行为和以前一样', () => {
    const navigate = jest.fn();
    const manager = new RouteManager(navigate);

    manager.navigateToWorkspace(7);

    expect(navigate).toHaveBeenCalledWith('/Workspace/7', undefined);
  });
});

describe('顶栏的工具条插槽', () => {
  it('工具条渲染在元信息那一行里，而不是另起一块', () => {
    const view = render(
      <MemoryRouter initialEntries={[{ pathname: '/Workspace/1' }]}>
        <WorkspaceDetailHeader
          workspace={workspace}
          onRename={() => {}}
          onDelete={() => {}}
          toolbar={<button type="button">批量删除</button>}
        />
      </MemoryRouter>,
    );

    const subrow = view.container.querySelector('.workspace-detail-subrow')!;
    expect(subrow.querySelector('.workspace-detail-meta')).not.toBeNull();
    expect(
      within(subrow as HTMLElement).getByText('批量删除'),
    ).toBeInTheDocument();
  });

  it('整块顶栏在同一个吸顶容器里', () => {
    const view = render(
      <MemoryRouter initialEntries={[{ pathname: '/Workspace/1' }]}>
        <WorkspaceDetailHeader
          workspace={workspace}
          onRename={() => {}}
          onDelete={() => {}}
          toolbar={<button type="button">批量删除</button>}
        />
      </MemoryRouter>,
    );

    const topbar = view.container.querySelector('.workspace-detail-topbar')!;
    // 返回链接、标题、元信息、工具条都得在里面，否则滚动时会散开
    expect(topbar.querySelector('.workspace-back-link')).not.toBeNull();
    expect(topbar.querySelector('.workspace-detail-head h1')).not.toBeNull();
    expect(topbar.querySelector('.workspace-detail-tools')).not.toBeNull();
  });

  it('不给工具条时那一格不渲染', () => {
    const view = render(
      <MemoryRouter initialEntries={[{ pathname: '/Workspace/1' }]}>
        <WorkspaceDetailHeader
          workspace={workspace}
          onRename={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>,
    );

    expect(view.container.querySelector('.workspace-detail-tools')).toBeNull();
  });
});
