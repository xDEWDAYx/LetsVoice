import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import RecordingReviewDialog from '../renderer/pages/Studio/components/RecordingReviewDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const props = {
  open: true,
  defaultNoteName: '会议',
  rawTranscript: '完整转写内容',
  summary: '来自 Structured Note 的摘要',
  processing: false,
  saving: false,
  error: null,
  onSave: jest.fn().mockResolvedValue(undefined),
  onRerecord: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(() => {
  props.onSave.mockClear();
  window.electron.workspace.getList = jest
    .fn()
    .mockResolvedValue([{ id: 1, name: '工作空间' }]);
});

describe('录音复核弹窗的 Structured Note Summary', () => {
  it('直接展示 Structured Note 草稿里的 Summary', async () => {
    render(<RecordingReviewDialog {...props} />);

    expect(screen.getByText('来自 Structured Note 的摘要')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('combobox')).not.toBeDisabled(),
    );
  });

  it('Structured Note 尚未完成时不能提前保存', async () => {
    render(<RecordingReviewDialog {...props} processing />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'recording.review.saveAndChat',
        }),
      ).toBeDisabled(),
    );
    expect(props.onSave).not.toHaveBeenCalled();
  });
});
