import {
  buildSnippet,
  highlightSegments,
  matchesAllTerms,
  splitSearchTerms,
} from '../renderer/pages/Dashboard/models/NoteSearch';
import { DashboardNoteItem } from '../renderer/pages/Dashboard/models/DashboardNoteItem';

describe('splitSearchTerms', () => {
  it('按空白拆词并统一小写', () => {
    expect(splitSearchTerms('  银行   执照 ')).toEqual(['银行', '执照']);
    expect(splitSearchTerms('Stand Up')).toEqual(['stand', 'up']);
  });

  it('空查询拆出空数组', () => {
    expect(splitSearchTerms('   ')).toEqual([]);
  });
});

describe('matchesAllTerms', () => {
  it('每个词都要命中，不是命中任意一个', () => {
    const text = '明天去银行办对公账号，要带营业执照';

    expect(matchesAllTerms(text, ['银行', '执照'])).toBe(true);
    expect(matchesAllTerms(text, ['银行', '护照'])).toBe(false);
  });

  it('没有关键词时一律算命中', () => {
    expect(matchesAllTerms('随便什么', [])).toBe(true);
  });
});

describe('buildSnippet', () => {
  const long = `${'开头的寒暄'.repeat(12)}关键内容在这里${'后面的闲聊'.repeat(12)}`;

  it('没搜索时就是开头一段', () => {
    expect(buildSnippet(long, [], 20)).toBe(`${long.slice(0, 20)}…`);
  });

  it('搜索时把窗口挪到命中词附近', () => {
    const snippet = buildSnippet(long, ['关键内容'], 20);

    expect(snippet).toContain('关键内容');
    // 前后都还有内容，两头都要有省略号
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('短文本原样返回，不加省略号', () => {
    expect(buildSnippet('很短的一句', ['短'], 40)).toBe('很短的一句');
  });

  it('关键词只在标题里、正文没有时，退回开头一段', () => {
    expect(buildSnippet(long, ['压根没有'], 20)).toBe(`${long.slice(0, 20)}…`);
  });
});

describe('highlightSegments', () => {
  it('把命中的词单独切出来', () => {
    expect(highlightSegments('去银行办事', ['银行'])).toEqual([
      { text: '去', hit: false },
      { text: '银行', hit: true },
      { text: '办事', hit: false },
    ]);
  });

  it('同一个词出现多次都要标出来', () => {
    const segments = highlightSegments('银行、银行', ['银行']);

    expect(segments.filter((segment) => segment.hit)).toHaveLength(2);
  });

  it('重叠的关键词合并成一段，不会切出交叉片段', () => {
    const segments = highlightSegments('对公账号', ['对公', '公账']);

    expect(segments).toEqual([
      { text: '对公账', hit: true },
      { text: '号', hit: false },
    ]);
  });

  it('没有关键词时原样返回一整段', () => {
    expect(highlightSegments('原文', [])).toEqual([
      { text: '原文', hit: false },
    ]);
  });
});

describe('DashboardNoteItem.matchesSearch', () => {
  const note = new DashboardNoteItem(
    1,
    1,
    '去银行办对公账号',
    null,
    '记得带营业执照和身份证复印件',
    false,
    null,
    new Date('2026-08-18T00:00:00.000Z'),
    new Date('2026-08-18T00:00:00.000Z'),
    'personal',
  );

  it('多个词可以分别落在标题和正文上', () => {
    expect(note.matchesSearch('银行 执照')).toBe(true);
  });

  it('有一个词落空就不算命中', () => {
    expect(note.matchesSearch('银行 报价单')).toBe(false);
  });

  it('也能按界面上显示的类型文案搜', () => {
    expect(note.matchesSearch('个人事务', '个人事务')).toBe(true);
  });
});
