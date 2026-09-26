/**
 * Agent 端到端评测的固定笔记库与任务集。
 *
 * dev 只用于调评测器；holdout 在第一次模型运行前冻结。笔记使用稳定 key，
 * SQLite 自增 id 只属于某次重建，判分时通过 manifest 映射回来。
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import { AGENT_EVAL_TASKS_V2 } from './agent-eval-tasks-v2';

export type AgentEvalLanguage = 'zh' | 'en' | 'zh-en';
export type AgentEvalSplit = 'dev' | 'holdout';
export type AgentEvalScenario =
  | 'single-note'
  | 'cross-note'
  | 'retrieval'
  | 'todo-tool'
  | 'scope'
  | 'unanswerable'
  | 'ambiguous';
export type AgentEvalAnswerMode = 'answer' | 'refuse' | 'clarify';

export type AgentEvalNote = {
  key: string;
  workspaceKey: string;
  language: AgentEvalLanguage;
  title: string;
  transcript: string;
  subnotes?: string[];
};

export type AgentEvalTodo = {
  titleAliases: string[];
  dueDate: string;
};

export type AgentEvalTask = {
  id: string;
  split: AgentEvalSplit;
  scenario: AgentEvalScenario;
  language: AgentEvalLanguage;
  instruction: string;
  workspaceKey: string | null;
  linkedNoteKeys: string[];
  relevantNoteKeys: string[];
  /** 每一组是一个事实，组内任一别名命中即可。 */
  requiredFacts: string[][];
  forbiddenFacts?: string[];
  answerMode: AgentEvalAnswerMode;
  requiresSearch: boolean;
  expectedTodos?: AgentEvalTodo[];
};

export const AGENT_EVAL_WORKSPACES = [
  { key: 'product', name: '产品研发 / Product' },
  { key: 'clients', name: '客户项目 / Clients' },
  { key: 'personal', name: '个人生活 / Personal' },
  { key: 'research', name: '研究资料 / Research' },
] as const;

const CORE_NOTES: AgentEvalNote[] = [
  {
    key: 'p-atlas-kickoff',
    workspaceKey: 'product',
    language: 'zh',
    title: 'Atlas 发布启动会',
    transcript:
      'Atlas 桌面版确定在 2026 年 10 月 18 日正式发布，批准预算为 48 万元。后端冻结日期是 9 月 25 日，项目负责人是林岚。Phoenix 是另一个项目，不要混淆。',
  },
  {
    key: 'p-atlas-risk',
    workspaceKey: 'product',
    language: 'en',
    title: 'Atlas payment risk review',
    transcript:
      'The payment gateway risk for Atlas is owned by vendor Northstar Payments. If certification slips, the approved fallback is manual bank transfer. The go/no-go review is September 12, 2026.',
  },
  {
    key: 'p-atlas-mobile',
    workspaceKey: 'product',
    language: 'zh-en',
    title: 'Atlas mobile beta',
    transcript:
      'Mobile beta 截止日期是 2026-10-03，owner 是 Sofia。Desktop backend freeze remains 2026-09-25，两个日期用途不同。',
  },
  {
    key: 'p-phoenix-kickoff',
    workspaceKey: 'product',
    language: 'zh',
    title: 'Phoenix 发布启动会',
    transcript:
      'Phoenix 项目预算是 72 万元，计划在 2026 年 11 月 6 日发布，负责人为周启。它与 Atlas 没有共享发布日期。',
  },
  {
    key: 'p-helios-scope',
    workspaceKey: 'product',
    language: 'en',
    title: 'Helios access code — product copy',
    transcript:
      'For the Product workspace deployment, the Helios recovery code is ORANGE-31. This value supersedes the old draft for this deployment only.',
  },
  {
    key: 'p-incident-ember',
    workspaceKey: 'product',
    language: 'en',
    title: 'Incident EMBER-42 root cause',
    transcript:
      'EMBER-42 was caused by a stale Redis feature-flag cache after the 14:00 deployment. Database writes were healthy; the cache served the retired checkout path.',
  },
  {
    key: 'p-incident-ember-followup',
    workspaceKey: 'product',
    language: 'zh-en',
    title: 'EMBER-42 remediation',
    transcript:
      '修复方案是 deployment 后主动执行 cache version bump，并把 Redis flag TTL 从 24 hours 降到 10 minutes。事件在 15:26 恢复。',
  },
  {
    key: 'p-api-zq',
    workspaceKey: 'product',
    language: 'en',
    title: 'Legacy API compatibility header',
    transcript:
      'Clients using protocol revision 4 must send compatibility header X-SpeakSpace-Code with value ZQ-17. ZQ-71 belongs to an abandoned draft and must not be used.',
  },
  {
    key: 'p-hiring-plan',
    workspaceKey: 'product',
    language: 'zh',
    title: '秋季招聘计划',
    transcript:
      '秋季计划招聘 2 名桌面端工程师和 1 名本地模型工程师。桌面端岗位由韩梅负责，本地模型岗位由 Omar 负责。',
  },
  {
    key: 'p-hiring-interviews',
    workspaceKey: 'product',
    language: 'en',
    title: 'Hiring interview notes',
    transcript:
      'Candidate Priya Nair passed the desktop systems loop with four yes votes. Candidate Evan Ross remains on hold for the local inference role.',
  },
  {
    key: 'p-todos-zh',
    workspaceKey: 'product',
    language: 'zh',
    title: '供应商跟进待办',
    transcript:
      '请在 2026 年 9 月 15 日前把供应商报价发给林岚；并在 2026 年 9 月 18 日预约安全评审。',
  },
  {
    key: 'p-todos-en',
    workspaceKey: 'product',
    language: 'en',
    title: 'Legal and accessibility actions',
    transcript:
      'Submit the legal redlines by 2026-09-20. Book the accessibility review for 2026-09-22.',
  },
  {
    key: 'p-todos-mixed',
    workspaceKey: 'product',
    language: 'zh-en',
    title: 'Release checklist actions',
    transcript:
      '2026-09-23 前 update release checklist；then email the QA sign-off by 2026-09-24。',
  },
  {
    key: 'p-todos-partial',
    workspaceKey: 'product',
    language: 'zh',
    title: '迁移收尾',
    transcript: '数据库迁移已经完成。请在 2026 年 9 月 26 日前更新回滚手册。',
  },
  {
    key: 'c-northwind-renewal',
    workspaceKey: 'clients',
    language: 'en',
    title: 'Northwind renewal commercial terms',
    transcript:
      'Northwind approved an annual renewal value of GBP 128,000. Maya Chen owns the commercial close, and the signature target is October 7, 2026.',
  },
  {
    key: 'c-northwind-support',
    workspaceKey: 'clients',
    language: 'zh-en',
    title: 'Northwind support escalation',
    transcript:
      'Northwind 的 Sev-1 ticket 是 NW-884，technical owner 为 Diego Ruiz。临时 workaround 是关闭 delta sync，不影响 renewal 金额。',
  },
  {
    key: 'c-cedar-renewal',
    workspaceKey: 'clients',
    language: 'en',
    title: 'Cedar renewal terms',
    transcript:
      'Cedar Labs renewed for GBP 182,000, with Olivia Park owning the close. This is unrelated to Northwind despite the similar renewal month.',
  },
  {
    key: 'c-lumen-scope',
    workspaceKey: 'clients',
    language: 'zh',
    title: 'Lumen 许可范围（已签版）',
    transcript:
      'Lumen 已签版许可上限为 250 名用户，审计日志保留 180 天。试用草案中的 500 人上限没有生效。',
  },
  {
    key: 'c-lumen-draft',
    workspaceKey: 'clients',
    language: 'en',
    title: 'Lumen trial draft — obsolete',
    transcript:
      'Obsolete trial draft: 500 users and 30-day audit retention. This draft was not signed and must not override the signed scope.',
  },
  {
    key: 'c-room-projector',
    workspaceKey: 'clients',
    language: 'zh-en',
    title: 'Orchid room projector replacement',
    transcript:
      'Orchid 会议室投影仪 replacement unit 的 serial number 是 PX-8841，安装窗口为 2026-09-08 09:30。旧设备序列号 PX-4818 已报废。',
  },
  {
    key: 'l-kyoto-flight',
    workspaceKey: 'personal',
    language: 'en',
    title: 'Kyoto trip flight',
    transcript:
      'Flight JL042 departs London Heathrow at 09:40 on November 2, 2026 and arrives at Haneda. The Kyoto connection is the 16:03 shinkansen from Shinagawa.',
  },
  {
    key: 'l-kyoto-hotel',
    workspaceKey: 'personal',
    language: 'zh-en',
    title: '京都酒店确认单',
    transcript:
      '入住 Kamo River Inn，check-in 是 2026-11-03 15:00。预订含早餐，可在抵达前 48 hours 免费取消。',
  },
  {
    key: 'l-kyoto-draft',
    workspaceKey: 'personal',
    language: 'zh',
    title: '京都旧行程草稿',
    transcript:
      '旧草稿曾写 11 月 4 日入住 Sakura Annex，但该预订已经取消，不应作为最终行程。',
  },
  {
    key: 'l-coffee',
    workspaceKey: 'personal',
    language: 'en',
    title: 'Ethiopian natural coffee recipe',
    transcript:
      'For the Ethiopian natural lot, use 18 g coffee, 270 g water at 92°C, and a 45-second bloom. Total target brew time is 2 minutes 50 seconds.',
  },
  {
    key: 'l-helios-code-conflict',
    workspaceKey: 'personal',
    language: 'en',
    title: 'Helios access code — personal draft',
    transcript:
      'Personal sandbox draft only: Helios code BLUE-77. It does not apply to the Product deployment.',
  },
  {
    key: 'r-battery-method',
    workspaceKey: 'research',
    language: 'en',
    title: 'Battery cycle experiment method',
    transcript:
      'The LFP experiment used 24 cells, charged at 0.5C and discharged at 1C. Passing requires at least 90% capacity retention after 600 cycles.',
  },
  {
    key: 'r-battery-results',
    workspaceKey: 'research',
    language: 'zh-en',
    title: 'LFP 600-cycle results',
    transcript:
      '600 cycles 后平均 capacity retention 为 92.4%，最低单体为 90.8%。按 method 里的 90% threshold，这批样品通过。',
  },
  {
    key: 'r-battery-draft',
    workspaceKey: 'research',
    language: 'en',
    title: 'Battery pilot — superseded',
    transcript:
      'The superseded pilot had 12 NMC cells and an 88% target. Those numbers do not describe the final LFP experiment.',
  },
  {
    key: 'r-retrieval-rrf',
    workspaceKey: 'research',
    language: 'zh',
    title: '混合检索参数记录',
    transcript:
      '关键词与向量结果使用 RRF 融合，常数 k 取 60。Agent 搜索工具最多返回 8 条结果，语义检索的 top K 也是 8。',
  },
  {
    key: 'r-graph-baseline',
    workspaceKey: 'research',
    language: 'en',
    title: 'Graph retrieval baseline',
    transcript:
      'The graph baseline used reciprocal rank constant 20 and returned 5 passages. It is a separate prototype, not the SpeakSpace Agent configuration.',
  },
];

const DISTRACTOR_TOPICS = [
  'design tokens',
  'meeting room booking',
  'expense policy',
  'garden watering',
  'keyboard firmware',
  'translation glossary',
  'release archive',
  'reading list',
  'printer maintenance',
  'onboarding checklist',
  'museum tickets',
  'backup drill',
] as const;

/** 补足到 80 条；内容固定且带近似数字，专门防止搜索只靠标题或数字取巧。 */
const GENERATED_NOTES: AgentEvalNote[] = Array.from(
  { length: 50 },
  (_, index) => {
    const workspace =
      AGENT_EVAL_WORKSPACES[index % AGENT_EVAL_WORKSPACES.length];
    const language = (['zh', 'en', 'zh-en'] as AgentEvalLanguage[])[index % 3];
    const serial = String(index + 11).padStart(2, '0');
    const topic = DISTRACTOR_TOPICS[index % DISTRACTOR_TOPICS.length];
    let transcript = `Archive ${serial} / ${topic}，reference DS-${100 + index}，review on 2026-12-${String((index % 20) + 1).padStart(2, '0')}。仅作 background，不是 Atlas、Northwind、Helios 或 LFP 的正式记录。`;
    if (language === 'zh') {
      transcript = `归档条目 ${serial}，主题是 ${topic}。参考编号 DS-${100 + index}，复查日期为 2026-12-${String((index % 20) + 1).padStart(2, '0')}。这是一条背景资料，不包含 Atlas、Northwind、Helios 或 LFP 的正式结论。`;
    } else if (language === 'en') {
      transcript = `Archive item ${serial} about ${topic}. Reference DS-${100 + index}; review date 2026-12-${String((index % 20) + 1).padStart(2, '0')}. This background note contains no authoritative Atlas, Northwind, Helios, or LFP decision.`;
    }
    const targetLength = [220, 600, 1200, 2200][index % 4];
    const filler =
      language === 'zh'
        ? ' 附录记录了例行复查流程、负责人轮值和归档格式；这些段落用于模拟真实长笔记，不包含其他项目结论。'
        : ' Appendix paragraphs record routine review steps, owner rotation, and archive formatting; they simulate realistic note length without adding another project decision.';
    while (transcript.length < targetLength) transcript += filler;
    transcript = transcript.slice(0, targetLength);
    return {
      key: `d-${workspace.key}-${serial}`,
      workspaceKey: workspace.key,
      language,
      title: `Archive ${serial}: ${topic}`,
      transcript,
    };
  },
);

export const AGENT_EVAL_NOTES: AgentEvalNote[] = [
  ...CORE_NOTES,
  ...GENERATED_NOTES,
];

const AGENT_EVAL_TASKS_V1: AgentEvalTask[] = [
  {
    id: 'single-01',
    split: 'dev',
    scenario: 'single-note',
    language: 'zh',
    instruction: 'Atlas 桌面版什么时候发布，批准预算是多少？',
    workspaceKey: 'product',
    linkedNoteKeys: ['p-atlas-kickoff'],
    relevantNoteKeys: ['p-atlas-kickoff'],
    requiredFacts: [
      ['2026年10月18日', '2026-10-18', '10月18日'],
      ['48万元', '48 万元', '480,000', '480000'],
    ],
    forbiddenFacts: ['72万元', '2026年11月6日'],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'single-02',
    split: 'dev',
    scenario: 'single-note',
    language: 'en',
    instruction:
      'What is Northwind’s annual renewal value, and who owns the commercial close?',
    workspaceKey: 'clients',
    linkedNoteKeys: ['c-northwind-renewal'],
    relevantNoteKeys: ['c-northwind-renewal'],
    requiredFacts: [['GBP 128,000', '£128,000', '128000'], ['Maya Chen']],
    forbiddenFacts: ['182,000', 'Olivia Park'],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'single-03',
    split: 'dev',
    scenario: 'single-note',
    language: 'zh-en',
    instruction: '京都酒店几点 check-in？免费取消窗口是什么？',
    workspaceKey: 'personal',
    linkedNoteKeys: ['l-kyoto-hotel'],
    relevantNoteKeys: ['l-kyoto-hotel'],
    requiredFacts: [
      [
        '2026-11-03 15:00',
        '11月3日15:00',
        '15:00',
        '11月3日下午3点',
        '下午3点',
      ],
      ['48 hours', '48小时', '48 小时'],
    ],
    forbiddenFacts: ['11月4日', 'Sakura Annex'],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'single-04',
    split: 'dev',
    scenario: 'single-note',
    language: 'zh',
    instruction: 'SpeakSpace 的混合检索 RRF 常数和最大返回条数分别是多少？',
    workspaceKey: 'research',
    linkedNoteKeys: ['r-retrieval-rrf'],
    relevantNoteKeys: ['r-retrieval-rrf'],
    requiredFacts: [
      ['k=60', 'k 取 60', '常数 60'],
      ['8条', '8 条', '最多返回 8'],
    ],
    forbiddenFacts: ['常数 20', '返回 5'],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'cross-01',
    split: 'dev',
    scenario: 'cross-note',
    language: 'zh-en',
    instruction:
      '综合这两条记录：Atlas 发布日是什么时候？payment vendor 是谁，延期时采用什么 fallback？',
    workspaceKey: 'product',
    linkedNoteKeys: ['p-atlas-kickoff', 'p-atlas-risk'],
    relevantNoteKeys: ['p-atlas-kickoff', 'p-atlas-risk'],
    requiredFacts: [
      ['2026年10月18日', '2026-10-18', 'October 18, 2026'],
      ['Northstar Payments'],
      ['manual bank transfer', '手工银行转账', '人工银行转账', '手动银行转账'],
    ],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'cross-02',
    split: 'dev',
    scenario: 'cross-note',
    language: 'en',
    instruction:
      'Summarize Northwind’s renewal value and its current Sev-1 ticket with the technical owner.',
    workspaceKey: 'clients',
    linkedNoteKeys: ['c-northwind-renewal', 'c-northwind-support'],
    relevantNoteKeys: ['c-northwind-renewal', 'c-northwind-support'],
    requiredFacts: [['128,000', '128000'], ['NW-884'], ['Diego Ruiz']],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'cross-03',
    split: 'dev',
    scenario: 'cross-note',
    language: 'zh-en',
    instruction:
      '把京都行程合起来：航班号、到达东京后的新干线，以及酒店入住时间是什么？',
    workspaceKey: 'personal',
    linkedNoteKeys: ['l-kyoto-flight', 'l-kyoto-hotel'],
    relevantNoteKeys: ['l-kyoto-flight', 'l-kyoto-hotel'],
    requiredFacts: [['JL042'], ['16:03'], ['2026-11-03 15:00', '11月3日15:00']],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'cross-04',
    split: 'dev',
    scenario: 'cross-note',
    language: 'en',
    instruction:
      'How many cells were tested, what was the pass threshold, and did the final LFP batch pass?',
    workspaceKey: 'research',
    linkedNoteKeys: ['r-battery-method', 'r-battery-results'],
    relevantNoteKeys: ['r-battery-method', 'r-battery-results'],
    requiredFacts: [
      ['24 cells', '24个', '24 个'],
      ['90%'],
      ['92.4%'],
      ['passed', '通过'],
    ],
    forbiddenFacts: ['12 NMC'],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'cross-05',
    split: 'holdout',
    scenario: 'cross-note',
    language: 'zh-en',
    instruction: '秋招一共有哪些 opening？Priya Nair 的面试结论是什么？',
    workspaceKey: 'product',
    linkedNoteKeys: ['p-hiring-plan', 'p-hiring-interviews'],
    relevantNoteKeys: ['p-hiring-plan', 'p-hiring-interviews'],
    requiredFacts: [
      ['2名桌面端', '2 名桌面端', 'two desktop'],
      ['1名本地模型', '1 名本地模型', 'one local model'],
      ['Priya Nair'],
      ['four yes votes', '4票通过', '通过'],
    ],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'retrieval-01',
    split: 'holdout',
    scenario: 'retrieval',
    language: 'en',
    instruction:
      'Search my notes: what value must protocol revision 4 clients put in the compatibility header?',
    workspaceKey: null,
    linkedNoteKeys: [],
    relevantNoteKeys: ['p-api-zq'],
    requiredFacts: [['ZQ-17']],
    forbiddenFacts: ['ZQ-71'],
    answerMode: 'answer',
    requiresSearch: true,
  },
  {
    id: 'retrieval-02',
    split: 'holdout',
    scenario: 'retrieval',
    language: 'zh-en',
    instruction:
      '帮我在笔记里找 Orchid 会议室 replacement projector 的新序列号。',
    workspaceKey: null,
    linkedNoteKeys: [],
    relevantNoteKeys: ['c-room-projector'],
    requiredFacts: [['PX-8841']],
    forbiddenFacts: ['PX-4818'],
    answerMode: 'answer',
    requiresSearch: true,
  },
  {
    id: 'retrieval-03',
    split: 'holdout',
    scenario: 'retrieval',
    language: 'en',
    instruction:
      'Find my Ethiopian natural coffee recipe: water temperature and bloom time?',
    workspaceKey: null,
    linkedNoteKeys: [],
    relevantNoteKeys: ['l-coffee'],
    requiredFacts: [
      ['92°C', '92 °C', '92 degrees'],
      ['45-second', '45 seconds', '45秒'],
    ],
    answerMode: 'answer',
    requiresSearch: true,
  },
  {
    id: 'retrieval-04',
    split: 'holdout',
    scenario: 'retrieval',
    language: 'zh-en',
    instruction: '查一下 EMBER-42 的 root cause 和最终 remediation。',
    workspaceKey: null,
    linkedNoteKeys: [],
    relevantNoteKeys: ['p-incident-ember', 'p-incident-ember-followup'],
    requiredFacts: [
      ['stale Redis', 'Redis feature-flag cache', 'Redis 功能标记缓存'],
      ['cache version bump', '缓存版本'],
      ['10 minutes', '10 分钟'],
    ],
    answerMode: 'answer',
    requiresSearch: true,
  },
  {
    id: 'todo-01',
    split: 'holdout',
    scenario: 'todo-tool',
    language: 'zh',
    instruction: '把这条笔记里的待办提取到我的待办列表，并告诉我结果。',
    workspaceKey: 'product',
    linkedNoteKeys: ['p-todos-zh'],
    relevantNoteKeys: ['p-todos-zh'],
    requiredFacts: [],
    answerMode: 'answer',
    requiresSearch: false,
    expectedTodos: [
      { titleAliases: ['供应商报价', '报价发给林岚'], dueDate: '2026-09-15' },
      { titleAliases: ['安全评审', '预约安全评审'], dueDate: '2026-09-18' },
    ],
  },
  {
    id: 'todo-02',
    split: 'holdout',
    scenario: 'todo-tool',
    language: 'en',
    instruction: 'Extract and save the action items from this note.',
    workspaceKey: 'product',
    linkedNoteKeys: ['p-todos-en'],
    relevantNoteKeys: ['p-todos-en'],
    requiredFacts: [],
    answerMode: 'answer',
    requiresSearch: false,
    expectedTodos: [
      {
        titleAliases: ['legal redlines', 'submit the legal'],
        dueDate: '2026-09-20',
      },
      {
        titleAliases: ['accessibility review', 'book the accessibility'],
        dueDate: '2026-09-22',
      },
    ],
  },
  {
    id: 'todo-03',
    split: 'holdout',
    scenario: 'todo-tool',
    language: 'zh-en',
    instruction: 'Please extract 这条 note 的 action items 并保存。',
    workspaceKey: 'product',
    linkedNoteKeys: ['p-todos-mixed'],
    relevantNoteKeys: ['p-todos-mixed'],
    requiredFacts: [],
    answerMode: 'answer',
    requiresSearch: false,
    expectedTodos: [
      {
        titleAliases: ['release checklist', 'update release'],
        dueDate: '2026-09-23',
      },
      { titleAliases: ['QA sign-off', 'email the QA'], dueDate: '2026-09-24' },
    ],
  },
  {
    id: 'todo-04',
    split: 'holdout',
    scenario: 'todo-tool',
    language: 'zh',
    instruction: '提取尚未完成的待办并保存，已经做完的不要加。',
    workspaceKey: 'product',
    linkedNoteKeys: ['p-todos-partial'],
    relevantNoteKeys: ['p-todos-partial'],
    requiredFacts: [],
    forbiddenFacts: ['数据库迁移'],
    answerMode: 'answer',
    requiresSearch: false,
    expectedTodos: [
      { titleAliases: ['回滚手册', '更新回滚'], dueDate: '2026-09-26' },
    ],
  },
  {
    id: 'scope-01',
    split: 'holdout',
    scenario: 'scope',
    language: 'en',
    instruction: 'What is the Helios recovery code for this deployment?',
    workspaceKey: 'product',
    linkedNoteKeys: ['p-helios-scope'],
    relevantNoteKeys: ['p-helios-scope'],
    requiredFacts: [['ORANGE-31']],
    forbiddenFacts: ['BLUE-77'],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'scope-02',
    split: 'holdout',
    scenario: 'scope',
    language: 'en',
    instruction:
      'What cancellation clause did Northwind sign? Answer only from this workspace.',
    workspaceKey: 'product',
    linkedNoteKeys: [],
    relevantNoteKeys: [],
    requiredFacts: [],
    answerMode: 'refuse',
    requiresSearch: true,
  },
  {
    id: 'scope-03',
    split: 'holdout',
    scenario: 'scope',
    language: 'zh',
    instruction: 'Lumen 已签版的用户上限和审计日志保留时间是多少？',
    workspaceKey: 'clients',
    linkedNoteKeys: ['c-lumen-scope'],
    relevantNoteKeys: ['c-lumen-scope'],
    requiredFacts: [
      ['250名', '250 名', '250 users'],
      ['180天', '180 天', '180 days'],
    ],
    forbiddenFacts: ['500 users', '500 人', '30-day'],
    answerMode: 'answer',
    requiresSearch: false,
  },
  {
    id: 'scope-04',
    split: 'holdout',
    scenario: 'scope',
    language: 'zh',
    instruction: 'Phoenix 的预算是多少？只能根据我挂上的这条笔记回答。',
    workspaceKey: 'product',
    linkedNoteKeys: ['p-atlas-kickoff'],
    relevantNoteKeys: [],
    requiredFacts: [],
    forbiddenFacts: ['72万元', '72 万元'],
    answerMode: 'refuse',
    requiresSearch: false,
  },
  {
    id: 'unknown-01',
    split: 'holdout',
    scenario: 'unanswerable',
    language: 'zh',
    instruction: '搜索所有笔记：火星办公室 Wi-Fi 密码是什么？',
    workspaceKey: null,
    linkedNoteKeys: [],
    relevantNoteKeys: [],
    requiredFacts: [],
    answerMode: 'refuse',
    requiresSearch: true,
  },
  {
    id: 'unknown-02',
    split: 'holdout',
    scenario: 'unanswerable',
    language: 'en',
    instruction: 'Search my notes and tell me the CEO’s middle name.',
    workspaceKey: null,
    linkedNoteKeys: [],
    relevantNoteKeys: [],
    requiredFacts: [],
    answerMode: 'refuse',
    requiresSearch: true,
  },
  {
    id: 'unknown-03',
    split: 'holdout',
    scenario: 'unanswerable',
    language: 'zh-en',
    instruction: '仓库 B 的 humidity limit 是多少？请从 notes 里找。',
    workspaceKey: null,
    linkedNoteKeys: [],
    relevantNoteKeys: [],
    requiredFacts: [],
    answerMode: 'refuse',
    requiresSearch: true,
  },
  {
    id: 'unknown-04',
    split: 'holdout',
    scenario: 'unanswerable',
    language: 'en',
    instruction: 'What GBP/USD exchange rate did we approve for Q4?',
    workspaceKey: null,
    linkedNoteKeys: [],
    relevantNoteKeys: [],
    requiredFacts: [],
    answerMode: 'refuse',
    requiresSearch: true,
  },
  {
    id: 'ambiguous-01',
    split: 'holdout',
    scenario: 'ambiguous',
    language: 'en',
    instruction: 'When is the deadline?',
    workspaceKey: 'product',
    linkedNoteKeys: ['p-atlas-kickoff', 'p-atlas-mobile'],
    relevantNoteKeys: ['p-atlas-kickoff', 'p-atlas-mobile'],
    requiredFacts: [],
    answerMode: 'clarify',
    requiresSearch: false,
  },
  {
    id: 'ambiguous-02',
    split: 'holdout',
    scenario: 'ambiguous',
    language: 'en',
    instruction: 'Who owns it?',
    workspaceKey: 'clients',
    linkedNoteKeys: ['c-northwind-renewal', 'c-northwind-support'],
    relevantNoteKeys: ['c-northwind-renewal', 'c-northwind-support'],
    requiredFacts: [],
    answerMode: 'clarify',
    requiresSearch: false,
  },
  {
    id: 'ambiguous-03',
    split: 'holdout',
    scenario: 'ambiguous',
    language: 'zh-en',
    instruction: '这个实验算通过了吗？先确认我指的是哪个 pass criterion。',
    workspaceKey: 'research',
    linkedNoteKeys: ['r-battery-method', 'r-battery-results'],
    relevantNoteKeys: ['r-battery-method', 'r-battery-results'],
    requiredFacts: [],
    answerMode: 'clarify',
    requiresSearch: false,
  },
];

/*
 * 两批任务合并对外。第一批 28 条写于脚手架实验之前；
 * 第二批 52 条是在发现「8 条开发集不足以做选择」之后补的，
 * 其 holdout 部分写的时候没有跑过任何一次评测。
 */
export const AGENT_EVAL_TASKS: AgentEvalTask[] = [
  ...AGENT_EVAL_TASKS_V1,
  ...AGENT_EVAL_TASKS_V2,
];

/*
 * 语料一旦被意外改动，前后两轮的数字就不可比。用硬断言钉住规模，
 * 改动语料时必须同时改这里，等于强制留下一次「我确实动了语料」的记录。
 */
if (AGENT_EVAL_NOTES.length !== 80) {
  throw new Error(`Agent 评测笔记数应为 80，实际 ${AGENT_EVAL_NOTES.length}`);
}
if (AGENT_EVAL_TASKS.length !== 90) {
  throw new Error(`Agent 评测任务数应为 90，实际 ${AGENT_EVAL_TASKS.length}`);
}
if (AGENT_EVAL_TASKS.filter((task) => task.split === 'dev').length < 40) {
  throw new Error('开发集少于 40 条：样本量不足以支撑脚手架选择');
}
