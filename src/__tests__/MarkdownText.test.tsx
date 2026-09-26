import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import MarkdownText from '../renderer/components/Markdown/MarkdownText';

describe('MarkdownText 渲染', () => {
  it('把 **文本** 渲染成真正的加粗元素，而不是显示星号', () => {
    const { container } = render(<MarkdownText content="请**务必**确认" />);
    expect(container.querySelector('strong')).toHaveTextContent('务必');
    expect(container.textContent).not.toContain('*');
  });

  it('渲染列表、标题和代码块', () => {
    const { container } = render(
      <MarkdownText content={'## 摘要\n\n- 甲\n- 乙\n\n```\ncode\n```'} />,
    );
    expect(container.querySelector('h4')).toHaveTextContent('摘要');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('pre code')).toHaveTextContent('code');
  });

  it('渲染表格', () => {
    const { container } = render(
      <MarkdownText content={'| A | B |\n| --- | --- |\n| 1 | 2 |'} />,
    );
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody td')).toHaveLength(2);
  });

  it('链接以 _blank 打开，交给主进程转到系统浏览器', () => {
    render(<MarkdownText content="[文档](https://example.com)" />);
    const link = screen.getByRole('link', { name: '文档' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('内容里的 HTML 只当字面量显示，不会真的建元素', () => {
    const { container } = render(
      <MarkdownText content='<img src=x onerror="alert(1)"> 之后' />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('script 标签同样不会被执行或建元素', () => {
    const { container } = render(
      <MarkdownText content="<script>alert(1)</script>" />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('伪协议（javascript 等）链接不会渲染成可点击链接', () => {
    const { container } = render(
      <MarkdownText content="[点我](javascript:alert(1))" />,
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('内容为空时显示传入的占位内容', () => {
    render(<MarkdownText content="   " fallback={<span>暂无</span>} />);
    expect(screen.getByText('暂无')).toBeInTheDocument();
  });

  it('纯文本转写原样显示，不引入多余元素', () => {
    const text = '今天开会讨论了预算和排期';
    const { container } = render(<MarkdownText content={text} />);
    expect(container.textContent).toBe(text);
    expect(container.querySelectorAll('strong, em, code')).toHaveLength(0);
  });
});
