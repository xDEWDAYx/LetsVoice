import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkspaceNoteCard from '../renderer/pages/Workspace/components/WorkspaceNoteCard';
import { NoteItem } from '../renderer/pages/Workspace/WorkspaceController';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh', resolvedLanguage: 'zh' },
    t: (key: string) => key,
  }),
}));

// 播放条自己会去主进程取音频，这里只关心它有没有被挂出来。
jest.mock(
  '../renderer/pages/Workspace/components/WorkspaceAudioPlayer',
  () => ({
    __esModule: true,
    default: () => <div data-testid="audio-player" />,
  }),
);

jest.mock(
  '../renderer/pages/Workspace/components/KnowledgeOutputPanel',
  () => ({
    __esModule: true,
    default: () => <section data-testid="knowledge-panel" />,
  }),
);

jest.mock('../renderer/pages/Workspace/components/NoteInsightsPanel', () => ({
  __esModule: true,
  default: () => <section data-testid="insights-panel" />,
}));

const baseNote: NoteItem = {
  id: 10,
  name: '去银行办对公账号所需材料',
  audio_relative_path: 'audio/10.webm',
  transcript: '呃，那个，就是明天。',
  is_pinned: 0,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
  subnotes: [],
  knowledge_outputs: [],
  conversations: [],
};

const renderCard = (note: NoteItem = baseNote, onDelete = jest.fn()) => {
  const view = render(
    <WorkspaceNoteCard workspaceId={1} note={note} onDelete={onDelete} />,
  );
  return { ...view, onDelete };
};

describe('笔记卡片的标题行', () => {
  it('播放、转 Word、转 PDF、日期、删除都在同一行，且按这个顺序', () => {
    const { container } = renderCard();
    const tools = container.querySelector('.workspace-note-tools')!;

    const order = Array.from(tools.children).map((child) =>
      child.tagName === 'TIME' ? 'date' : (child.textContent ?? '').trim(),
    );

    expect(order).toEqual([
      'workspace.note.play',
      'workspace.note.exportWord',
      'workspace.note.exportPdf',
      'date',
      // 回收站按钮只有图标，没有文字
      '',
    ]);
  });

  it('删除按钮不再单独占一行页脚', () => {
    const { container } = renderCard();

    expect(container.querySelector('.workspace-note-footer')).toBeNull();
    expect(
      container.querySelector('.workspace-note-tools .trash-can-button'),
    ).not.toBeNull();
  });

  it('导出时只传笔记身份，由主进程读取完整内容', () => {
    const exportNote = jest.fn().mockResolvedValue(undefined);
    const { electron } = window;
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: new Proxy(electron, {
        get(target, property, receiver) {
          if (property === 'export') return { note: exportNote };
          return Reflect.get(target, property, receiver);
        },
      }),
    });
    const { getByText } = renderCard();

    fireEvent.click(getByText('workspace.note.exportWord'));

    expect(exportNote).toHaveBeenCalledWith({
      workspaceId: 1,
      noteId: 10,
      format: 'word',
    });
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: electron,
    });
  });

  it('点删除会把这条笔记报上去', () => {
    const onDelete = jest.fn();
    const { container } = renderCard(baseNote, onDelete);

    fireEvent.click(
      container.querySelector('.workspace-note-tools .trash-can-button')!,
    );

    expect(onDelete).toHaveBeenCalledWith(10);
  });
});

describe('录音播放', () => {
  it('平时不占地方，点播放才展开播放条', () => {
    renderCard();

    expect(screen.queryByTestId('audio-player')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('workspace.note.play'));

    expect(screen.getByTestId('audio-player')).toBeInTheDocument();
    // 再点一次收起来
    fireEvent.click(screen.getByText('workspace.note.stop'));
    expect(screen.queryByTestId('audio-player')).not.toBeInTheDocument();
  });

  it('没有录音的笔记不显示播放按钮', () => {
    renderCard({ ...baseNote, audio_relative_path: null });

    expect(screen.queryByText('workspace.note.play')).not.toBeInTheDocument();
  });
});

describe('内容区排版', () => {
  it('没有 sub-note 时不渲染那一块，免得空占一格', () => {
    const { container } = renderCard();

    expect(container.querySelector('.workspace-knowledge-section')).toBeNull();
  });

  it('有 sub-note 时才出现', () => {
    const { container } = renderCard({
      ...baseNote,
      subnotes: [
        {
          id: 1,
          content_type: 'note',
          content: '摘要内容',
          created_at: '2026-08-20T00:00:00.000Z',
        },
      ],
    });

    expect(
      container.querySelector('.workspace-knowledge-section'),
    ).not.toBeNull();
  });
});
