/**
 * 笔记搜索的文本处理：拆词、命中片段、高亮分段。
 *
 * 单独成文件是因为这几段逻辑纯粹是字符串处理，和 React 无关，
 * 可以直接写单测，也能被列表和筛选两边共用。
 */

/** 一段文本按命中与否切开后的片段。 */
export type TextSegment = {
  text: string;
  hit: boolean;
};

/**
 * 把查询串拆成多个词。
 *
 * 空格分隔的每个词都要命中（AND）：搜「银行 执照」应该只剩下同时提到
 * 这两件事的那条，而不是把两个词各自的结果并起来。
 */
export function splitSearchTerms(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

/** 文本是否命中全部关键词。 */
export function matchesAllTerms(text: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = text.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** 最早出现的关键词位置，一个都没有则返回 -1。 */
function firstHitIndex(text: string, terms: string[]): number {
  const haystack = text.toLowerCase();
  let earliest = -1;
  terms.forEach((term) => {
    const index = haystack.indexOf(term);
    if (index === -1) return;
    if (earliest === -1 || index < earliest) earliest = index;
  });
  return earliest;
}

/**
 * 列表里那行灰色概览。
 *
 * 没在搜索时就是开头一段；搜索时把窗口挪到第一个命中词附近——
 * 命中的内容在转录第 800 字，却只给用户看开头 40 字，等于没告诉他为什么这条会被搜出来。
 */
export function buildSnippet(
  text: string,
  terms: string[],
  length: number = 40,
): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= length) return flat;

  const hit = terms.length > 0 ? firstHitIndex(flat, terms) : -1;
  if (hit === -1) return `${flat.slice(0, length)}…`;

  // 命中词前面留一点上文，读起来才知道说的是什么
  const lead = 12;
  const start = Math.max(0, hit - lead);
  const end = Math.min(flat.length, start + length);
  const body = flat.slice(start, end);
  return `${start > 0 ? '…' : ''}${body}${end < flat.length ? '…' : ''}`;
}

/**
 * 按关键词把文本切成「命中 / 未命中」的片段，交给界面渲染 <mark>。
 * 关键词重叠时按先到先得合并，不会切出交叉的片段。
 */
export function highlightSegments(
  text: string,
  terms: string[],
): TextSegment[] {
  if (terms.length === 0 || text === '') return [{ text, hit: false }];

  const haystack = text.toLowerCase();
  // 先标出每个字符是否落在某个关键词里，再按连续段合并，
  // 比逐个关键词切分再拼回去简单得多，也不怕重叠。
  const marked = new Array<boolean>(text.length).fill(false);
  terms.forEach((term) => {
    let from = haystack.indexOf(term);
    while (from !== -1) {
      for (let i = from; i < from + term.length; i += 1) marked[i] = true;
      from = haystack.indexOf(term, from + term.length);
    }
  });

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (let i = 1; i <= text.length; i += 1) {
    if (i === text.length || marked[i] !== marked[cursor]) {
      segments.push({ text: text.slice(cursor, i), hit: marked[cursor] });
      cursor = i;
    }
  }
  return segments;
}
