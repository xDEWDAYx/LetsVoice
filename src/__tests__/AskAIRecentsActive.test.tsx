import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import AskAINotesPanel from '../renderer/pages/AskAI/components/AskAINotesPanel';
import { AskAIConversation } from '../renderer/pages/AskAI/AskAITypes';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh', resolvedLanguage: 'zh' },
    t: (key: string) => key,
  }),
}));

const conversations: AskAIConversation[] = [
  {
    id: 1,
    name: '关于银行材料',
    updatedAt: '2026-08-21T10:00:00.000Z',
  } as AskAIConversation,
  {
    id: 2,
    name: '周会纪要',
    updatedAt: '2026-08-21T09:00:00.000Z',
  } as AskAIConversation,
];

const renderPanel = (activeConversationId: number | null) =>
  render(
    <AskAINotesPanel
      notes={[]}
      conversations={conversations}
      activeConversationId={activeConversationId}
      selectedNoteId={null}
      onAddNote={() => {}}
      onSelectNote={() => {}}
      onOpenConversation={() => {}}
      onDeleteNote={() => {}}
    />,
  );

const rowOf = (name: string) => screen.getByText(name).closest('button');

describe('最近会话里的当前会话', () => {
  it('只有正在进行的那一条常亮', () => {
    renderPanel(2);

    expect(rowOf('周会纪要')).toHaveClass('active');
    expect(rowOf('关于银行材料')).not.toHaveClass('active');
  });

  it('用 aria-current 告诉读屏软件哪条是当前会话', () => {
    renderPanel(2);

    expect(rowOf('周会纪要')).toHaveAttribute('aria-current', 'true');
    expect(rowOf('关于银行材料')).not.toHaveAttribute('aria-current');
  });

  it('刚点了「新建会话」还没提问时，谁都不亮', () => {
    renderPanel(null);

    expect(rowOf('周会纪要')).not.toHaveClass('active');
    expect(rowOf('关于银行材料')).not.toHaveClass('active');
  });
});
