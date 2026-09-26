import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ModelSelect from './ModelSelect';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const options = [
  {
    id: 'model-a',
    name: 'Model A',
    downloaded: false,
    active: false,
  },
  {
    id: 'model-b',
    name: 'Model B',
    downloaded: false,
    active: false,
  },
];

describe('ModelSelect concurrent operations', () => {
  it('disables only the model already downloading', () => {
    const onDownload = jest.fn();
    render(
      <ModelSelect
        label="Language model"
        onDelete={null}
        onDownload={onDownload}
        onSelect={jest.fn()}
        operations={{
          'model-a': { busy: true, progress: null, error: '' },
        }}
        options={options}
        placeholder="Select"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Language model' }));
    const firstDownload = screen.getByRole('button', {
      name: 'modelManager.action.download Model A',
    });
    const secondDownload = screen.getByRole('button', {
      name: 'modelManager.action.download Model B',
    });

    expect(firstDownload).toBeDisabled();
    expect(secondDownload).toBeEnabled();
    fireEvent.click(secondDownload);
    expect(onDownload).toHaveBeenCalledWith('model-b');
  });

  it('shows progress for the matching model row', () => {
    render(
      <ModelSelect
        label="Language model"
        onDelete={null}
        onDownload={jest.fn()}
        onSelect={jest.fn()}
        operations={{
          'model-a': {
            busy: true,
            error: '',
            progress: { message: 'pulling layers', percent: 42 },
          },
        }}
        options={options}
        placeholder="Select"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Language model' }));
    expect(
      screen.getByRole('progressbar', {
        name: 'Model A pulling layers',
      }),
    ).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });
});
