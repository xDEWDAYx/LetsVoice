import React, { useMemo } from 'react';
import { BlockNode, InlineNode, parseBlocks, TableAlign } from './markdownAst';
import './MarkdownText.css';

/**
 * 把本地模型输出的 Markdown 渲染成富文本。
 *
 * 全程只产出 React 元素，不使用 dangerouslySetInnerHTML，
 * 所以模型或笔记里混进的 HTML 只会显示成字面量，不会被执行。
 *
 * 注意：TTS 和复制按钮应继续拿原始文本 —— 朗读有自己的去标记逻辑
 * （见 tts/TTSContent.ts），复制则应保留 Markdown 源码。
 */

export function renderInline(
  nodes: InlineNode[],
  keyPrefix: string,
): React.ReactNode {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'text':
        return <React.Fragment key={key}>{node.value}</React.Fragment>;
      case 'strong':
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
      case 'em':
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case 'del':
        return <del key={key}>{renderInline(node.children, key)}</del>;
      case 'code':
        return (
          <code key={key} className="markdown-inline-code">
            {node.value}
          </code>
        );
      case 'link':
        // 主进程的 setWindowOpenHandler 会把 _blank 链接交给系统浏览器，
        // 应用自身不会被导航走。
        return (
          <a key={key} href={node.href} target="_blank" rel="noreferrer">
            {renderInline(node.children, key)}
          </a>
        );
      case 'break':
        return <br key={key} />;
      default:
        return null;
    }
  });
}

function alignStyle(align: TableAlign): React.CSSProperties | undefined {
  return align ? { textAlign: align } : undefined;
}

function renderBlock(node: BlockNode, key: string): React.ReactNode {
  switch (node.type) {
    case 'heading': {
      const Tag = `h${Math.min(node.level + 2, 6)}` as 'h3';
      // 整体降两级：聊天气泡里的 # 不该抢页面 h1/h2 的层级。
      return <Tag key={key}>{renderInline(node.children, key)}</Tag>;
    }
    case 'paragraph':
      return <p key={key}>{renderInline(node.children, key)}</p>;
    case 'code':
      return (
        <pre key={key} className="markdown-code-block">
          <code data-lang={node.lang ?? undefined}>{node.value}</code>
        </pre>
      );
    case 'blockquote':
      return (
        <blockquote key={key}>
          {node.children.map((child, index) =>
            renderBlock(child, `${key}-${index}`),
          )}
        </blockquote>
      );
    case 'hr':
      return <hr key={key} />;
    case 'list': {
      const items = node.items.map((item, index) => {
        const itemKey = `${key}-${index}`;
        return (
          <li
            key={itemKey}
            className={item.checked === null ? undefined : 'markdown-task-item'}
          >
            {item.checked !== null && (
              <input type="checkbox" checked={item.checked} readOnly />
            )}
            {item.children.map((child, childIndex) =>
              renderBlock(child, `${itemKey}-${childIndex}`),
            )}
          </li>
        );
      });
      return node.ordered ? (
        <ol key={key} start={node.start}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case 'table':
      return (
        // 宽表在自己的容器里横向滚动，不把聊天气泡撑破。
        <div key={key} className="markdown-table-scroll">
          <table>
            <thead>
              <tr>
                {node.header.map((cell, index) => (
                  <th
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${key}-h-${index}`}
                    style={alignStyle(node.align[index] ?? null)}
                  >
                    {renderInline(cell, `${key}-h-${index}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, rowIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={`${key}-r-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td
                      // eslint-disable-next-line react/no-array-index-key
                      key={`${key}-r-${rowIndex}-${cellIndex}`}
                      style={alignStyle(node.align[cellIndex] ?? null)}
                    >
                      {renderInline(cell, `${key}-r-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

type MarkdownTextProps = {
  content: string;
  /** 额外的容器类名，便于沿用各页面已有的排版样式。 */
  className?: string;
  /** 内容为空时显示的占位内容。 */
  fallback?: React.ReactNode;
};

function MarkdownText({
  content,
  className,
  fallback,
}: MarkdownTextProps): React.ReactNode {
  // 聊天列表每次新消息都会整体重渲染，解析结果按内容缓存。
  const blocks = useMemo(() => parseBlocks(content ?? ''), [content]);

  // 空内容不套容器，交给调用方给的占位内容，省掉一层多余的 div。
  if (blocks.length === 0) return fallback ?? null;

  return (
    <div className={className ? `markdown-body ${className}` : 'markdown-body'}>
      {blocks.map((block, index) => renderBlock(block, `b-${index}`))}
    </div>
  );
}

export default React.memo(MarkdownText);
