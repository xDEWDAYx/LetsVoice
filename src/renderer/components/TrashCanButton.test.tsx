import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import TrashCanButton from './TrashCanButton';

describe('TrashCanButton', () => {
  it('renders the animated SVG directly inside the centered button', () => {
    render(<TrashCanButton label="Move note to Trash" onClick={jest.fn()} />);

    const button = screen.getByRole('button', {
      name: 'Move note to Trash',
    });

    expect(button.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(button.querySelectorAll('path')).toHaveLength(4);
  });
});
