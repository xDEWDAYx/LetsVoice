import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ShortcutRecorder from '../renderer/pages/Settings/components/ShortcutRecorder';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const renderRecorder = (
  overrides: Partial<React.ComponentProps<typeof ShortcutRecorder>> = {},
) => {
  const onChange = jest.fn();
  render(
    <ShortcutRecorder
      accelerator="CommandOrControl+Alt+D"
      description="desc"
      disabled={false}
      label="呼出仪表板"
      onChange={onChange}
      state="registered"
      {...overrides}
    />,
  );
  return { onChange };
};

const keyBox = () => screen.getByRole('button', { name: /shortcut.record/ });

describe('快捷键录制', () => {
  it('平时显示当前组合的可读写法', () => {
    renderRecorder();

    expect(keyBox()).toHaveTextContent('Ctrl+Alt+D');
  });

  it('点一下进入录制态，按下组合就报上去', () => {
    const { onChange } = renderRecorder();

    fireEvent.click(keyBox());
    expect(keyBox()).toHaveTextContent(
      'settings.background.shortcut.listening',
    );

    fireEvent.keyDown(keyBox(), { key: 'g', ctrlKey: true, altKey: true });

    expect(onChange).toHaveBeenCalledWith('CommandOrControl+Alt+G');
  });

  it('只按修饰键时继续等，不会误提交', () => {
    const { onChange } = renderRecorder();

    fireEvent.click(keyBox());
    fireEvent.keyDown(keyBox(), { key: 'Control', ctrlKey: true });

    expect(onChange).not.toHaveBeenCalled();
    expect(keyBox()).toHaveTextContent(
      'settings.background.shortcut.listening',
    );
  });

  it('Esc 取消录制，原来的组合不变', () => {
    const { onChange } = renderRecorder();

    fireEvent.click(keyBox());
    fireEvent.keyDown(keyBox(), { key: 'Escape' });

    expect(onChange).not.toHaveBeenCalled();
    expect(keyBox()).toHaveTextContent('Ctrl+Alt+D');
  });

  it('Backspace 解绑', () => {
    const { onChange } = renderRecorder();

    fireEvent.click(keyBox());
    fireEvent.keyDown(keyBox(), { key: 'Backspace' });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('没绑时显示「未设置」，也不显示解绑按钮', () => {
    renderRecorder({ accelerator: null, state: 'disabled' });

    expect(keyBox()).toHaveTextContent('settings.background.shortcut.unset');
    expect(
      screen.queryByText('settings.background.shortcut.clear'),
    ).not.toBeInTheDocument();
  });

  it('被占用时把状态喊出来给读屏软件', () => {
    renderRecorder({ state: 'conflict' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'settings.background.shortcut.state.conflict',
    );
  });
});
