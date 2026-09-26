import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import AskAINotesPanel from '../renderer/pages/AskAI/components/AskAINotesPanel';
import { AskAINote } from '../renderer/pages/AskAI/AskAITypes';
import TourDragDemo from '../renderer/onboarding/TourDragDemo';
import { ONBOARDING_STEPS } from '../renderer/onboarding/OnboardingSteps';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'zh' }, t: (key: string) => key }),
}));

/** 在 jsdom 里造一个有真实尺寸的元素——默认所有 rect 都是 0，起点终点会重合。 */
function placeElement(className: string, box: DOMRect | Partial<DOMRect>) {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = '周会纪要';
  element.getBoundingClientRect = () =>
    ({ top: 0, left: 0, width: 0, height: 0, ...box }) as DOMRect;
  document.body.appendChild(element);
  return element;
}

const SPEC = { fromSelector: '.note', toSelector: '.chat' };

const numberVar = (element: HTMLElement, name: string) =>
  Number.parseFloat(element.style.getPropertyValue(name));

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * 拖拽演示的意义全在「动起来的那一段」：起点和终点必须是页面上真实两个
 * 元素的位置。任何一头找不到就整个不画，宁可不演也别演一段从左上角飞到
 * 左上角的空动作。
 */
describe('引导里的拖拽演示', () => {
  it('起点终点都在，才画出飞行的卡片和落点', async () => {
    placeElement('note', { top: 100, left: 20, width: 160, height: 40 });
    placeElement('chat', { top: 60, left: 400, width: 500, height: 400 });

    const { container } = render(<TourDragDemo spec={SPEC} />);

    await waitFor(() =>
      expect(container.querySelector('.tour-drag__ghost')).not.toBeNull(),
    );
    const ghost = container.querySelector('.tour-drag__ghost') as HTMLElement;
    // 起点在笔记上，终点在对话区里——两头不能是同一个地方
    expect(numberVar(ghost, '--from-x')).toBeCloseTo(20 + 160 / 2 - 160 / 2);
    expect(numberVar(ghost, '--to-x')).toBeGreaterThan(400);
    expect(numberVar(ghost, '--to-y')).toBeGreaterThan(
      numberVar(ghost, '--from-y'),
    );
    // 落点用的是对话区真的那层拖拽提示，不是另画一个
    expect(
      container.querySelector('.tour-drag__drop .studio-drop-hint'),
    ).not.toBeNull();
  });

  it('终点不在页面上就整个不画', async () => {
    placeElement('note', { top: 100, left: 20, width: 160, height: 40 });

    const { container } = render(<TourDragDemo spec={SPEC} />);

    await waitFor(() => expect(document.querySelector('.note')).not.toBeNull());
    expect(container.querySelector('.tour-drag')).toBeNull();
  });

  it('起点找不到就退回这一步打光的那个元素', async () => {
    placeElement('list', { top: 80, left: 10, width: 200, height: 300 });
    placeElement('chat', { top: 60, left: 400, width: 500, height: 400 });

    const { container } = render(
      <TourDragDemo fallbackSelector=".list" spec={SPEC} />,
    );

    await waitFor(() =>
      expect(container.querySelector('.tour-drag__ghost')).not.toBeNull(),
    );
    const ghost = container.querySelector('.tour-drag__ghost') as HTMLElement;
    expect(numberVar(ghost, '--from-y')).toBeCloseTo(80 + 300 / 2 - 42 / 2);
  });

  it('笔记栏很窄时，卡片也不许飞出屏幕左边', async () => {
    // 40px 宽的一栏，卡片有最小宽度，居中放会是负的
    placeElement('note', { top: 100, left: 0, width: 40, height: 40 });
    placeElement('chat', { top: 60, left: 200, width: 300, height: 400 });

    const { container } = render(<TourDragDemo spec={SPEC} />);

    await waitFor(() =>
      expect(container.querySelector('.tour-drag__ghost')).not.toBeNull(),
    );
    const ghost = container.querySelector('.tour-drag__ghost') as HTMLElement;
    expect(numberVar(ghost, '--from-x')).toBeGreaterThanOrEqual(0);
  });

  it('那一步确实配了拖拽演示，指的是笔记卡片和对话区', () => {
    const step = ONBOARDING_STEPS.find((item) => item.id === 'libraryDrag');

    expect(step?.dragDemo).toEqual({
      fromSelector: '.ask-ai-note-card',
      toSelector: '.studio-chat',
    });
  });

  it('起点那个选择器，在笔记库里认得出一张真能拖的卡片', () => {
    // 演示的是「这东西能拖」。选择器写错了不会报错，动画只是不出现，
    // 于是这一步又退回成一句干巴巴的「拖到右边的对话框」。
    const step = ONBOARDING_STEPS.find((item) => item.id === 'libraryDrag');
    const note: AskAINote = {
      id: 1,
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
        onSelectNote={() => {}}
        selectedNoteId={null}
      />,
    );

    const card = container.querySelector(
      step?.dragDemo?.fromSelector as string,
    );

    expect(card).not.toBeNull();
    expect(card).toHaveAttribute('draggable');
  });
});
