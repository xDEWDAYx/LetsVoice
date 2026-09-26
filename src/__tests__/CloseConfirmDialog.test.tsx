import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CloseConfirmDialog from '../renderer/background/CloseConfirmDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

type RequestListener = (request: unknown) => void;

let emit: RequestListener | null = null;
const resolveClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  emit = null;
  (window as any).electron = {
    background: {
      onRequest: (listener: RequestListener) => {
        emit = listener;
        return () => {
          emit = null;
        };
      },
      resolveClose,
    },
  };
});

const openDialog = () => {
  render(<CloseConfirmDialog />);
  act(() => emit!({ type: 'confirmClose' }));
};

describe('关窗询问弹窗', () => {
  it('平时不存在，主进程来请求时才出现', () => {
    render(<CloseConfirmDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => emit!({ type: 'confirmClose' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('别的后台请求不会误弹出来', () => {
    render(<CloseConfirmDialog />);

    act(() => emit!({ type: 'startQuickRecord' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('三个选项分别把语义值回传给主进程', () => {
    openDialog();
    fireEvent.click(screen.getByText('background.close.tray'));
    expect(resolveClose).toHaveBeenCalledWith('tray', false);

    openDialog();
    fireEvent.click(screen.getByText('background.close.quit'));
    expect(resolveClose).toHaveBeenLastCalledWith('quit', false);

    openDialog();
    fireEvent.click(screen.getByText('background.close.cancel'));
    expect(resolveClose).toHaveBeenLastCalledWith('cancel', false);
  });

  it('勾了「记住」就一起传上去', () => {
    openDialog();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('background.close.tray'));

    expect(resolveClose).toHaveBeenCalledWith('tray', true);
  });

  it('每次重新打开都从「不记住」开始', () => {
    openDialog();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('background.close.cancel'));

    openDialog();

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('Esc 等于取消：不关窗也不改设置', () => {
    openDialog();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(resolveClose).toHaveBeenCalledWith('cancel', false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('点遮罩取消，点弹窗本体不算', () => {
    const { container } = render(<CloseConfirmDialog />);
    act(() => emit!({ type: 'confirmClose' }));

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(resolveClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(container.querySelector('.close-confirm-overlay')!);
    expect(resolveClose).toHaveBeenCalledWith('cancel', false);
  });

  it('默认焦点落在推荐项上，回车即可确认', () => {
    openDialog();

    expect(screen.getByText('background.close.tray')).toHaveFocus();
  });
});
