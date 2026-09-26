import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import TrashUndoToast from './TrashUndoToast';

describe('TrashUndoToast', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not dismiss while an undo operation is still running', async () => {
    jest.useFakeTimers();
    let resolveUndo: (() => void) | undefined;
    const onDismiss = jest.fn();
    const onUndo = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveUndo = resolve;
        }),
    );

    render(
      <TrashUndoToast
        dismissLabel="Dismiss"
        message="Moved to Trash"
        onDismiss={onDismiss}
        onUndo={onUndo}
        undoLabel="Undo"
        undoingLabel="Restoring..."
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(onUndo).toHaveBeenCalledTimes(1));

    act(() => {
      jest.advanceTimersByTime(5001);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      resolveUndo?.();
      await Promise.resolve();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
