import {
  BlockNode,
  InlineNode,
  parseBlocks,
  parseInline,
} from '../renderer/components/Markdown/markdownAst';

/** 把 AST 压成好断言的字符串，避免每个用例都手写整棵树。 */
function inlineToText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.value;
        case 'strong':
          return `<b>${inlineToText(node.children)}</b>`;
        case 'em':
          return `<i>${inlineToText(node.children)}</i>`;
        case 'del':
          return `<s>${inlineToText(node.children)}</s>`;
        case 'code':
          return `<c>${node.value}</c>`;
        case 'link':
          return `<a ${node.href}>${inlineToText(node.children)}</a>`;
        case 'break':
          return '\\n';
        default:
          return '';
      }
    })
    .join('');
}

function inline(source: string): string {
  return inlineToText(parseInline(source));
}

describe('行内标记', () => {
  it('把 **文本** 解析为加粗，这是模型最常输出的标记', () => {
    expect(inline('请**务必**确认')).toBe('请<b>务必</b>确认');
  });

  it('支持 __加粗__ 与 *斜体* / _斜体_', () => {
    expect(inline('__粗__ 和 *斜* 和 _斜_')).toBe(
      '<b>粗</b> 和 <i>斜</i> 和 <i>斜</i>',
    );
  });

  it('***三星号*** 同时加粗和倾斜', () => {
    expect(inline('***重点***')).toBe('<b><i>重点</i></b>');
  });

  it('支持删除线和行内代码', () => {
    expect(inline('~~废弃~~ 用 `npm run lint`')).toBe(
      '<s>废弃</s> 用 <c>npm run lint</c>',
    );
  });

  it('行内代码里的星号不再当成标记', () => {
    expect(inline('`a ** b`')).toBe('<c>a ** b</c>');
  });

  it('反斜杠转义的星号原样显示', () => {
    expect(inline('5 \\* 3 = 15')).toBe('5 * 3 = 15');
  });

  it('单独的星号不会被吃掉', () => {
    expect(inline('2 * 3 * 4')).toBe('2 * 3 * 4');
  });

  it('未闭合的标记退化为纯文本，不吞掉后面的内容', () => {
    expect(inline('**没关好')).toBe('**没关好');
    expect(inline('结尾有个 *')).toBe('结尾有个 *');
  });

  it('词中间的下划线不当成斜体（snake_case）', () => {
    expect(inline('调用 some_long_name 即可')).toBe('调用 some_long_name 即可');
  });

  it('解析链接，并把标题部分丢掉', () => {
    expect(inline('见 [文档](https://example.com "标题")')).toBe(
      '见 <a https://example.com>文档</a>',
    );
  });

  it('危险协议的链接降级为纯文本，不生成可点击元素', () => {
    expect(inline('[点我](javascript:alert(1))')).toBe(
      '[点我](javascript:alert(1))',
    );
  });

  it('嵌套标记按层级解析', () => {
    expect(inline('**粗里有`码`和*斜***')).toBe(
      '<b>粗里有<c>码</c>和<i>斜</i></b>',
    );
  });

  it('段落内的换行保留为软换行', () => {
    expect(inline('第一行\n第二行')).toBe('第一行\\n第二行');
  });
});

describe('块级结构', () => {
  it('解析各级标题', () => {
    const blocks = parseBlocks('# 一级\n\n### 三级');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 });
    expect(blocks[1]).toMatchObject({ type: 'heading', level: 3 });
  });

  it('解析无序列表，星号列表不会被误判成斜体', () => {
    const [list] = parseBlocks('* 第一项\n* 第二项');
    expect(list.type).toBe('list');
    if (list.type !== 'list') throw new Error('expected list');
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
    expect(
      inlineToText(
        (
          list.items[0].children[0] as never as {
            children: InlineNode[];
          }
        ).children,
      ),
    ).toBe('第一项');
  });

  it('解析有序列表并保留起始序号', () => {
    const [list] = parseBlocks('3. 三\n4. 四');
    expect(list).toMatchObject({ type: 'list', ordered: true, start: 3 });
  });

  it('解析任务列表的勾选态', () => {
    const [list] = parseBlocks('- [x] 已完成\n- [ ] 待办');
    if (list.type !== 'list') throw new Error('expected list');
    expect(list.items.map((item) => item.checked)).toEqual([true, false]);
  });

  it('解析嵌套列表', () => {
    const [list] = parseBlocks('- 外层\n  - 内层');
    if (list.type !== 'list') throw new Error('expected list');
    expect(list.items).toHaveLength(1);
    const nested = list.items[0].children.find(
      (child) => child.type === 'list',
    );
    expect(nested).toBeDefined();
  });

  it('解析围栏代码块并保留语言与原始缩进', () => {
    const [code] = parseBlocks('```ts\nconst a = 1;\n  indented\n```');
    expect(code).toEqual({
      type: 'code',
      lang: 'ts',
      value: 'const a = 1;\n  indented',
    });
  });

  it('未闭合的代码块也能渲染（流式输出被截断时常见）', () => {
    const [code] = parseBlocks('```\nhalf written');
    expect(code).toMatchObject({ type: 'code', value: 'half written' });
  });

  it('代码块内部的 # 和 - 不被当成标题或列表', () => {
    const blocks = parseBlocks('```\n# not a heading\n- not a list\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('code');
  });

  it('解析引用块', () => {
    const [quote] = parseBlocks('> 引用第一行\n> 引用第二行');
    expect(quote.type).toBe('blockquote');
  });

  it('解析分隔线，且不与列表符号混淆', () => {
    const blocks = parseBlocks('上\n\n---\n\n下');
    expect(blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'hr',
      'paragraph',
    ]);
  });

  it('解析表格与列对齐', () => {
    const [table] = parseBlocks(
      '| 名称 | 数量 |\n| :--- | ---: |\n| 苹果 | 3 |\n| 梨 | 5 |',
    );
    if (table.type !== 'table') throw new Error('expected table');
    expect(table.align).toEqual(['left', 'right']);
    expect(table.header.map(inlineToText)).toEqual(['名称', '数量']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1].map(inlineToText)).toEqual(['梨', '5']);
  });

  it('空白输入产出空数组，渲染端据此显示占位内容', () => {
    expect(parseBlocks('')).toEqual([]);
    expect(parseBlocks('   \n\n  ')).toEqual([]);
  });

  it('纯口语转写原样成段，不会凭空多出标记', () => {
    const source = '今天开会讨论了三件事 第一是预算 第二是排期 第三是招聘';
    const blocks = parseBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(
      inlineToText(
        (blocks[0] as Extract<BlockNode, { type: 'paragraph' }>).children,
      ),
    ).toBe(source);
  });

  it('混合文档保持块顺序', () => {
    const blocks = parseBlocks(
      [
        '## 摘要',
        '',
        '会议**要点**如下：',
        '',
        '- 甲',
        '- 乙',
        '',
        '> 备注',
      ].join('\n'),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'blockquote',
    ]);
  });
});
