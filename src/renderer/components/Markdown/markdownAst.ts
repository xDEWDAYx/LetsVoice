/**
 * 本地模型输出的 Markdown 解析器。
 *
 * 为什么自己写而不是引 react-markdown：那条依赖链是纯 ESM，Jest 走 ts-jest
 * 时必须给几十个包配 transformIgnorePatterns，成本和脆弱度都高于这里要覆盖的
 * 语法量。模型聊天输出的语法面很窄，值得换成一份可完整测试、零依赖的实现。
 *
 * 安全性由结构保证：这里只产出 AST，渲染端一律走 React 元素，
 * 全程不碰 dangerouslySetInnerHTML，所以笔记里混进 HTML 也只会被当成字面量。
 */

// 递归下降解析天然是相互递归的：类型上 BlockNode ↔ ListItem，
// 函数上 parseInline ↔ matchEmphasis。类型和函数声明都会提升，这里安全。
/* eslint-disable no-use-before-define */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'del'; children: InlineNode[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: InlineNode[] }
  | { type: 'break' };

export type TableAlign = 'left' | 'center' | 'right' | null;

export type ListItem = {
  /** 任务列表的勾选态；普通列表项为 null。 */
  checked: boolean | null;
  children: BlockNode[];
};

export type BlockNode =
  | { type: 'heading'; level: number; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'code'; lang: string | null; value: string }
  | { type: 'blockquote'; children: BlockNode[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | {
      type: 'table';
      align: TableAlign[];
      header: InlineNode[][];
      rows: InlineNode[][][];
    }
  | { type: 'hr' };

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const FENCE = /^(\s*)(`{3,}|~{3,})[ \t]*([^`\s]*)[ \t]*$/;
const HR = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const BLOCKQUOTE = /^ {0,3}>[ \t]?(.*)$/;
const UL_ITEM = /^(\s*)([-*+])[ \t]+(.*)$/;
const OL_ITEM = /^(\s*)(\d{1,9})[.)][ \t]+(.*)$/;
const TASK_MARK = /^\[([ xX])\][ \t]+(.*)$/;
const TABLE_DELIM =
  /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** 反斜杠只对 Markdown 标点生效，`\d` 这类要原样保留。 */
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!>~|]/;

/** 只放行安全协议：模型输出里的 javascript: / data: 一律降级成纯文本。 */
const SAFE_HREF = /^(https?:\/\/|mailto:|#|\/)/i;

function runLengthAt(input: string, start: number, marker: string): number {
  let length = 0;
  while (input[start + length] === marker) length += 1;
  return length;
}

/**
 * 下划线在词中间（snake_case、__dunder__）不该被当成强调，
 * 星号没有这个问题，所以只对 `_` 做左侧边界检查。
 */
function canOpenUnderscore(input: string, start: number): boolean {
  const before = start === 0 ? '' : input[start - 1];
  return before === '' || /[\s\p{P}]/u.test(before);
}

/**
 * 找到与开标记配对的闭标记。
 *
 * 两条规则：
 * 1. 闭标记左边不能是空白，否则 `** a **` 会被当成强调，与主流实现不符。
 * 2. 命中的标记若落在更长的连续标记里，要贴着这段标记的**末尾**取。
 *    `**粗*斜***` 结尾是三个星号，`**` 必须取后两个，
 *    剩下的那个才能去闭合里层的斜体；取前两个会把嵌套拆错。
 */
function findClosingRun(
  input: string,
  from: number,
  marker: string,
  width: number,
): number {
  const needle = marker.repeat(width);
  let index = input.indexOf(needle, from);
  while (index !== -1) {
    let runStart = index;
    while (runStart > from && input[runStart - 1] === marker) runStart -= 1;
    const runLength = runLengthAt(input, runStart, marker);
    const before = input[runStart - 1];

    if (
      runStart > from &&
      runLength >= width &&
      before !== undefined &&
      !/\s/.test(before)
    ) {
      return runStart + runLength - width;
    }
    index = input.indexOf(needle, index + 1);
  }
  return -1;
}

function matchEmphasis(
  input: string,
  start: number,
): { node: InlineNode; end: number } | null {
  const marker = input[start];
  if (marker !== '*' && marker !== '_' && marker !== '~') return null;

  const run = runLengthAt(input, start, marker);

  if (marker === '~') {
    if (run < 2) return null;
    const close = findClosingRun(input, start + 2, marker, 2);
    if (close === -1) return null;
    return {
      node: {
        type: 'del',
        children: parseInline(input.slice(start + 2, close)),
      },
      end: close + 2,
    };
  }

  if (marker === '_' && !canOpenUnderscore(input, start)) return null;

  const width = Math.min(run, 3);
  // 开标记后面紧跟空白时不是强调，多半是列表符号或字面星号。
  const next = input[start + width];
  if (next === undefined || /\s/.test(next)) return null;

  const close = findClosingRun(input, start + width, marker, width);
  if (close === -1) return null;

  const inner = parseInline(input.slice(start + width, close));
  const end = close + width;
  if (width === 3) {
    return {
      node: { type: 'strong', children: [{ type: 'em', children: inner }] },
      end,
    };
  }
  if (width === 2) return { node: { type: 'strong', children: inner }, end };
  return { node: { type: 'em', children: inner }, end };
}

function matchLink(
  input: string,
  start: number,
): { label: string; href: string; end: number } | null {
  let depth = 0;
  let cursor = start;
  while (cursor < input.length) {
    const char = input[cursor];
    if (char === '\\') {
      cursor += 2;
      // eslint-disable-next-line no-continue
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
    cursor += 1;
  }
  if (depth !== 0 || input[cursor + 1] !== '(') return null;

  const close = input.indexOf(')', cursor + 2);
  if (close === -1) return null;

  // 目标里可能带 title：[x](url "标题")，标题当前不渲染。
  const [href = ''] = input
    .slice(cursor + 2, close)
    .trim()
    .split(/\s+/);
  return { label: input.slice(start + 1, cursor), href, end: close + 1 };
}

export function parseInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = '';
  let index = 0;

  const flush = () => {
    if (buffer.length > 0) {
      nodes.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  while (index < input.length) {
    const char = input[index];

    if (char === '\\' && ESCAPABLE.test(input[index + 1] ?? '')) {
      buffer += input[index + 1];
      index += 2;
      // eslint-disable-next-line no-continue
      continue;
    }

    // 换行在段落内保留成软换行：聊天回答里的分行是有意义的排版。
    if (char === '\n') {
      flush();
      nodes.push({ type: 'break' });
      index += 1;
      // eslint-disable-next-line no-continue
      continue;
    }

    // 行内代码优先级最高，反引号内部不再解析任何标记。
    if (char === '`') {
      const fence = runLengthAt(input, index, '`');
      const close = input.indexOf('`'.repeat(fence), index + fence);
      if (close !== -1) {
        flush();
        nodes.push({
          type: 'code',
          value: input.slice(index + fence, close).trim(),
        });
        index = close + fence;
        // eslint-disable-next-line no-continue
        continue;
      }
    }

    if (char === '[') {
      const link = matchLink(input, index);
      if (link && SAFE_HREF.test(link.href)) {
        flush();
        nodes.push({
          type: 'link',
          href: link.href,
          children: parseInline(link.label),
        });
        index = link.end;
        // eslint-disable-next-line no-continue
        continue;
      }
    }

    const emphasis = matchEmphasis(input, index);
    if (emphasis) {
      flush();
      nodes.push(emphasis.node);
      index = emphasis.end;
      // eslint-disable-next-line no-continue
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
  return nodes;
}

function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let index = 0;
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  while (index < trimmed.length) {
    const char = trimmed[index];
    if (char === '\\' && trimmed[index + 1] === '|') {
      cell += '|';
      index += 2;
      // eslint-disable-next-line no-continue
      continue;
    }
    if (char === '|') {
      cells.push(cell.trim());
      cell = '';
      index += 1;
      // eslint-disable-next-line no-continue
      continue;
    }
    cell += char;
    index += 1;
  }
  cells.push(cell.trim());
  return cells;
}

function readAlignments(line: string): TableAlign[] {
  return splitTableRow(line).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

/** 缩进宽度，tab 按 4 空格算。 */
function indentWidth(prefix: string): number {
  return prefix.replace(/\t/g, '    ').length;
}

function matchListItem(
  line: string,
): { indent: number; ordered: boolean; start: number; text: string } | null {
  const ordered = OL_ITEM.exec(line);
  if (ordered) {
    return {
      indent: indentWidth(ordered[1]),
      ordered: true,
      start: Number(ordered[2]),
      text: ordered[3],
    };
  }
  // 先排除 `- - -` 这类分隔线，再当成列表项。
  if (HR.test(line)) return null;
  const unordered = UL_ITEM.exec(line);
  if (unordered) {
    return {
      indent: indentWidth(unordered[1]),
      ordered: false,
      start: 1,
      text: unordered[3],
    };
  }
  return null;
}

export function parseBlocks(source: string): BlockNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: BlockNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().length === 0) {
      index += 1;
      // eslint-disable-next-line no-continue
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[2][0];
      const body: string[] = [];
      index += 1;
      while (index < lines.length) {
        const closing = FENCE.exec(lines[index]);
        if (closing && closing[2][0] === marker && closing[3] === '') break;
        body.push(lines[index]);
        index += 1;
      }
      // 未闭合的围栏也当成代码块，模型流式输出被截断时很常见。
      if (index < lines.length) index += 1;
      blocks.push({
        type: 'code',
        lang: fence[3] || null,
        value: body.join('\n'),
      });
      // eslint-disable-next-line no-continue
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      // eslint-disable-next-line no-continue
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        children: parseInline(heading[2]),
      });
      index += 1;
      // eslint-disable-next-line no-continue
      continue;
    }

    if (BLOCKQUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && BLOCKQUOTE.test(lines[index])) {
        quoted.push((BLOCKQUOTE.exec(lines[index]) as RegExpExecArray)[1]);
        index += 1;
      }
      blocks.push({
        type: 'blockquote',
        children: parseBlocks(quoted.join('\n')),
      });
      // eslint-disable-next-line no-continue
      continue;
    }

    // 表格：当前行有竖线，且下一行是对齐行。
    if (
      line.includes('|') &&
      index + 1 < lines.length &&
      TABLE_DELIM.test(lines[index + 1])
    ) {
      const header = splitTableRow(line).map(parseInline);
      const align = readAlignments(lines[index + 1]);
      index += 2;
      const rows: InlineNode[][][] = [];
      while (
        index < lines.length &&
        lines[index].trim().length > 0 &&
        lines[index].includes('|')
      ) {
        rows.push(splitTableRow(lines[index]).map(parseInline));
        index += 1;
      }
      blocks.push({ type: 'table', align, header, rows });
      // eslint-disable-next-line no-continue
      continue;
    }

    const listStart = matchListItem(line);
    if (listStart) {
      const { ordered, start } = listStart;
      const baseIndent = listStart.indent;
      const items: ListItem[] = [];
      let itemLines: string[] = [];

      const closeItem = () => {
        if (itemLines.length === 0) return;
        const raw = itemLines.join('\n');
        const task = TASK_MARK.exec(raw);
        const checked = task ? task[1].toLowerCase() === 'x' : null;
        const body = task ? raw.slice(task[0].length - task[2].length) : raw;
        items.push({ checked, children: parseBlocks(body) });
        itemLines = [];
      };

      while (index < lines.length) {
        const current = lines[index];
        const item = matchListItem(current);

        if (item && item.indent <= baseIndent) {
          // 同级或更外层的新项：类型变了就交给外层循环重新开一个列表。
          if (item.indent < baseIndent || item.ordered !== ordered) break;
          closeItem();
          itemLines.push(item.text);
          index += 1;
          // eslint-disable-next-line no-continue
          continue;
        }

        if (current.trim().length === 0) {
          // 空行后若不再有更深缩进的内容，列表就结束了。
          const next = lines[index + 1];
          const continues =
            next !== undefined &&
            next.trim().length > 0 &&
            indentWidth(next.match(/^\s*/)?.[0] ?? '') > baseIndent;
          if (!continues) break;
          itemLines.push('');
          index += 1;
          // eslint-disable-next-line no-continue
          continue;
        }

        if (indentWidth(current.match(/^\s*/)?.[0] ?? '') > baseIndent) {
          // 续行去掉一层缩进后递归解析，嵌套列表由此自然展开。
          itemLines.push(current.slice(baseIndent + 1).replace(/^\s{0,3}/, ''));
          index += 1;
          // eslint-disable-next-line no-continue
          continue;
        }

        break;
      }

      closeItem();
      blocks.push({ type: 'list', ordered, start, items });
      // eslint-disable-next-line no-continue
      continue;
    }

    // 其余按段落处理：直到空行或下一个块级结构。
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (
        current.trim().length === 0 ||
        HR.test(current) ||
        HEADING.test(current) ||
        FENCE.test(current) ||
        BLOCKQUOTE.test(current) ||
        matchListItem(current)
      ) {
        break;
      }
      paragraph.push(current.trim());
      index += 1;
    }
    if (paragraph.length > 0) {
      blocks.push({
        type: 'paragraph',
        children: parseInline(paragraph.join('\n')),
      });
    }
  }

  return blocks;
}

/**
 * 内容里是否存在值得走富文本渲染的标记。
 * 纯口语转写走这条快路径，省掉整棵 AST 的构建。
 */
export function hasMarkdown(source: string): boolean {
  return /(\*\*|__|~~|`|^\s{0,3}#{1,6}\s|^\s{0,3}[-*+]\s|^\s{0,3}\d+[.)]\s|^\s{0,3}>|\[[^\]]+]\([^)]*\)|\|)/m.test(
    source,
  );
}
