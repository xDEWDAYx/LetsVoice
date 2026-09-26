import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import App from '../renderer/App';

describe('App', () => {
  it('使用完整产品名渲染应用外壳', () => {
    const view = render(<App />);

    expect(view.getByText('SpeakSpace Local')).toBeInTheDocument();
  });
});
