import '@testing-library/jest-dom';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import AskAINotesPanel from '../renderer/pages/AskAI/components/AskAINotesPanel';
import { AskAINote } from '../renderer/pages/AskAI/AskAITypes';
import TourClickDemo from '../renderer/onboarding/TourClickDemo';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'zh' }, t: (key: string) => key }),
}));

/** jsdom 里所有 rect 默认都是 0，得自己给尺寸，否则落点和面板会挤成一团。 */
function placeElement(className: string, box: Partial<DOMRect>) {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = '周会纪要';
  element.getBoundingClientRect = () =>
    ({ top: 0, left: 0, width: 0, height: 0, ...box }) as DOMRect;
  document.body.appendChild(element);
  return element;
}

const SPEC = { onSelector: '.note', panelHostSelector: '.page' };
const NOTE_PREVIEW_SPEC = {
  onSelector: '.ask-ai-note-card',
  panelHostSelector: '.studio-page',
};

const numberVar = (element: HTMLElement, name: string) =>
  Number.parseFloat(element.style.getPropertyValue(name));

const px = (value: string) => Number.parseFloat(value);

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * 双击是个隐藏动作，这段演示是它唯一的说明。演示只要有一头量不到就整个
 * 不画 —— 宁可不演，也别画一个指针戳在屏幕左上角、面板贴在页面外面。
 */
describe('引导里的双击演示', () => {
  it('落点和容器都在，才画出指针、水波和详情面板', async () => {
    placeElement('note', { top: 100, left: 20, width: 160, height: 40 });
    placeElement('page', { top: 0, left: 0, width: 1200, height: 700 });

    const { container } = render(<TourClickDemo spec={SPEC} />);

    await waitFor(() =>
      expect(container.querySelector('.tour-click__cursor')).not.toBeNull(),
    );
    const root = container.querySelector('.tour-click') as HTMLElement;
    // 落点就是那张卡片的中心，指针和两圈水波都对着它
    expect(numberVar(root, '--click-x')).toBeCloseTo(100);
    expect(numberVar(root, '--click-y')).toBeCloseTo(120);
    expect(container.querySelectorAll('.tour-click__ripple')).toHaveLength(2);
    // 面板里是真预览那套结构，不是另画一版
    expect(
      container.querySelector('.tour-click__panel .ask-ai-note-preview'),
    ).not.toBeNull();
  });

  it('指针从旁边摸过来，不是凭空贴在卡片上', async () => {
    placeElement('note', { top: 100, left: 20, width: 160, height: 40 });
    placeElement('page', { top: 0, left: 0, width: 1200, height: 700 });

    const { container } = render(<TourClickDemo spec={SPEC} />);

    await waitFor(() =>
      expect(container.querySelector('.tour-click')).not.toBeNull(),
    );
    const root = container.querySelector('.tour-click') as HTMLElement;
    expect(numberVar(root, '--from-x')).not.toBeCloseTo(
      numberVar(root, '--click-x'),
    );
    expect(numberVar(root, '--from-y')).toBeGreaterThan(
      numberVar(root, '--click-y'),
    );
  });

  it('面板贴着容器右边缘，宽度跟真的那一栏一样夹在 250–330 之间', async () => {
    placeElement('note', { top: 100, left: 20, width: 160, height: 40 });
    placeElement('page', { top: 8, left: 6, width: 1200, height: 700 });

    const { container } = render(<TourClickDemo spec={SPEC} />);

    await waitFor(() =>
      expect(container.querySelector('.tour-click__panel')).not.toBeNull(),
    );
    const panel = container.querySelector('.tour-click__panel') as HTMLElement;
    const width = px(panel.style.width);

    expect(width).toBeGreaterThanOrEqual(250);
    expect(width).toBeLessThanOrEqual(330);
    // 右边缘对齐容器右边缘
    expect(px(panel.style.left) + width).toBeCloseTo(6 + 1200);
    expect(px(panel.style.height)).toBeCloseTo(700);
  });

  it('窗口很窄时面板也不会缩得没法看', async () => {
    placeElement('note', { top: 100, left: 20, width: 160, height: 40 });
    placeElement('page', { top: 0, left: 0, width: 700, height: 500 });

    const { container } = render(<TourClickDemo spec={SPEC} />);

    await waitFor(() =>
      expect(container.querySelector('.tour-click__panel')).not.toBeNull(),
    );
    const panel = container.querySelector('.tour-click__panel') as HTMLElement;

    expect(px(panel.style.width)).toBe(250);
  });

  it('容器不在页面上就整个不画', async () => {
    placeElement('note', { top: 100, left: 20, width: 160, height: 40 });

    const { container } = render(<TourClickDemo spec={SPEC} />);

    await waitFor(() => expect(document.querySelector('.note')).not.toBeNull());
    expect(container.querySelector('.tour-click')).toBeNull();
  });

  it('落点找不到就退回这一步打光的那个元素', async () => {
    placeElement('list', { top: 60, left: 10, width: 200, height: 300 });
    placeElement('page', { top: 0, left: 0, width: 1200, height: 700 });

    const { container } = render(
      <TourClickDemo fallbackSelector=".list" spec={SPEC} />,
    );

    await waitFor(() =>
      expect(container.querySelector('.tour-click')).not.toBeNull(),
    );
    const root = container.querySelector('.tour-click') as HTMLElement;
    expect(numberVar(root, '--click-y')).toBeCloseTo(60 + 300 / 2);
  });

  it('演示指的那个东西，双击它真的会打开详情', () => {
    // 选择器写错了不会报错，指针只会戳在一个跟双击毫无关系的地方
    const onPreviewNote = jest.fn();
    const note: AskAINote = {
      id: 7,
      workspaceId: null,
      name: '周会纪要',
      transcript: '',
      transcriptPreview: '',
      updatedAt: '2026-08-21T10:00:00.000Z',
    };

    const { container } = render(
      <AskAINotesPanel
        activeConversationId={null}
        conversations={[]}
        notes={[note]}
        onAddNote={() => {}}
        onDeleteNote={() => {}}
        onOpenConversation={() => {}}
        onPreviewNote={onPreviewNote}
        onSelectNote={() => {}}
        selectedNoteId={null}
      />,
    );

    const card = container.querySelector(
      NOTE_PREVIEW_SPEC.onSelector,
    ) as HTMLElement;
    expect(card).not.toBeNull();

    fireEvent.doubleClick(within(card).getByText('周会纪要'));

    expect(onPreviewNote).toHaveBeenCalledWith(7);
  });
});
