/**
 * 待办提取评测语料。
 *
 * 两个子集，拆分的理由要写进报告：
 *
 *  - dev（22 条）：调提示词期间反复跑过的开发集。提示词是照着这些用例改出来的，
 *    所以它上面的分数天然偏乐观，只能当作回归基线，不能当作泛化能力的证据。
 *  - holdout（32 条）：提示词定稿之后才写的保留集，写的时候没有再改任何提示词。
 *    它才是用来回答「这套流水线到底行不行」的那一半。
 *
 * 参考时间固定为 2026-08-20 14:30（周四），所有期望日期都按这一天推算，
 * 与 src/main/dashboard/RelativeDateRewriter.ts 的规则一致。
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import type { RepeatKind } from '../../src/main/dashboard/RecurrenceExpander';

/** 评测基准时间。周四，用来固定所有相对日期的期望值。 */
export const EVAL_NOW = new Date(2026, 7, 20, 14, 30);
export const EVAL_TODAY = '2026-08-20';

export type GoldTask = {
  /** 标题命中任意一个关键词即认为匹配上这条金标任务。 */
  keywords: string[];
  /** 期望日期。null 表示不检查日期。 */
  dueDate?: string | null;
  /** 语义本身有歧义时，命中其中之一即可。 */
  anyDueDate?: string[];
  /** 期望的重复类型。undefined 表示不检查。 */
  repeat?: RepeatKind | null;
};

export type EvalCase = {
  id: string;
  split: 'dev' | 'holdout';
  /** 场景标签，用于按场景聚合指标。 */
  scenario: string;
  name: string;
  text: string;
  /** 必须抽到的任务。空数组表示期望零待办。 */
  tasks: GoldTask[];
  /**
   * 抽到不算错、不抽也不算漏的任务。
   * 用于语义本身就有歧义的边界用例，避免把主观判断记成模型缺陷。
   */
  optionalTasks?: GoldTask[];
  /** 绝不该出现的日期，通常是数字干扰项。 */
  forbiddenDates?: string[];
};

/* ------------------------------ 开发集 22 条 ------------------------------ */

const DEV_CASES: EvalCase[] = [
  {
    id: 'D01',
    split: 'dev',
    scenario: '绝对日期',
    name: '单条任务，绝对日期',
    text: '九月四号上午十点我要去参加那个供应商的评审会，地点在三号楼会议室。',
    tasks: [{ keywords: ['评审', '供应商', '会'], dueDate: '2026-09-04' }],
    forbiddenDates: ['2026-08-03', '2026-09-03'],
  },
  {
    id: 'D02',
    split: 'dev',
    scenario: '多任务',
    name: '多条任务，混合日期',
    text: '这周的安排我说一下。周五之前把季度报表发给财务那边，下周一要交差旅报销的单子，然后八月三十一号之前必须把服务器的续费办完，不然要停机。',
    tasks: [
      { keywords: ['报表', '财务'], dueDate: '2026-08-21' },
      { keywords: ['报销', '差旅'], dueDate: '2026-08-24' },
      { keywords: ['续费', '服务器'], dueDate: '2026-08-31' },
    ],
  },
  {
    id: 'D03',
    split: 'dev',
    scenario: '相对日期',
    name: '口语相对时间',
    text: '明天早上记得给张经理回个电话，后天下午的培训我要提前半小时到，下周三还得跟法务过一遍合同条款。',
    tasks: [
      { keywords: ['电话', '张经理'], dueDate: '2026-08-21' },
      { keywords: ['法务', '合同'], dueDate: '2026-08-26' },
    ],
    optionalTasks: [{ keywords: ['培训'], dueDate: '2026-08-22' }],
  },
  {
    id: 'D04',
    split: 'dev',
    scenario: '模糊时间',
    name: '模糊时间范围（上旬 / 年底）',
    text: '这个月底前要把新人的入职材料整理好，下个月上旬安排一次团队复盘，年底之前争取把这套流程文档补全。',
    tasks: [
      { keywords: ['入职', '材料', '新人'], dueDate: '2026-08-31' },
      { keywords: ['复盘'], dueDate: '2026-09-10' },
      { keywords: ['文档', '流程'], dueDate: '2026-12-31' },
    ],
  },
  {
    id: 'D05',
    split: 'dev',
    scenario: '周期任务',
    name: '周期性事项（每天 + 每周五）',
    text: '从下周开始我每天早上九点半都要过一遍值班群的消息，每周五下班前发一次周报。',
    tasks: [
      { keywords: ['值班', '消息', '群'], repeat: 'daily' },
      { keywords: ['周报'], repeat: 'weekly' },
    ],
  },
  {
    id: 'D06',
    split: 'dev',
    scenario: '提醒日',
    name: '事件日 + 提醒日',
    text: '我下个月九月十号要去客户现场做汇报，麻烦提前三天提醒我准备材料。',
    tasks: [{ keywords: ['汇报', '材料', '客户'], dueDate: '2026-09-07' }],
  },
  {
    id: 'D07',
    split: 'dev',
    scenario: '提醒日',
    name: '截止日 + 提前量',
    text: '投标文件的截止时间是九月十五号中午十二点，我打算提前一周就开始弄，到时候九月八号那天记得叫我一下。',
    tasks: [{ keywords: ['投标'], dueDate: '2026-09-08' }],
  },
  {
    id: 'D08',
    split: 'dev',
    scenario: '去重',
    name: '同一件事反复提',
    text: '那个预算表的事啊…就是预算表，我得改一下预算表。周三之前改完就行，对，就是那个预算的表格，别忘了。',
    tasks: [{ keywords: ['预算'], dueDate: '2026-08-26' }],
  },
  {
    id: 'D09',
    split: 'dev',
    scenario: '隐晦任务',
    name: '抱怨式待办',
    text: '唉，李工那边的接口文档拖了快两周了，我这边一直卡着动不了。',
    tasks: [{ keywords: ['接口', '文档', '李工'] }],
  },
  {
    id: 'D10',
    split: 'dev',
    scenario: '隐晦任务',
    name: '客户在等',
    text: '客户那边还等着我们的报价呢，这都第三天了，人家昨天又问了一次。',
    tasks: [{ keywords: ['报价', '客户'] }],
  },
  {
    id: 'D11',
    split: 'dev',
    scenario: '隐晦任务',
    name: '心里记挂',
    text: '有个事儿我心里一直悬着，就是仓库那批货的保险还没续，回头得找王姐问问。',
    tasks: [{ keywords: ['保险', '王姐', '续'] }],
  },
  {
    id: 'D12',
    split: 'dev',
    scenario: '边界',
    name: '极度含蓄（0 或 1 都可接受）',
    text: '老陈今天提的那个事，我觉得不能再拖了。',
    tasks: [],
    optionalTasks: [{ keywords: ['老陈', '事'] }],
  },
  {
    id: 'D13',
    split: 'dev',
    scenario: '委婉语气',
    name: '被动委婉语气',
    text: '如果方便的话，麻烦周四之前帮我看一眼那份合同，不着急，但最好别拖到下周。',
    tasks: [{ keywords: ['合同'], dueDate: '2026-08-27' }],
  },
  {
    id: 'D14',
    split: 'dev',
    scenario: '假阳性',
    name: '纯陈述，无任务',
    text: '今天的会主要是同步一下上半年的情况。营收比去年同期涨了百分之十二，华东区表现最好，华南稍微差一点。人员方面没什么变动，就这些。',
    tasks: [],
  },
  {
    id: 'D15',
    split: 'dev',
    scenario: '假阳性',
    name: '已完成事项',
    text: '昨天已经把报销单交上去了，合同也签完了，服务器的续费上周就办好了，邮件我也回过了。这几件事都结了。',
    tasks: [],
  },
  {
    id: 'D16',
    split: 'dev',
    scenario: '任务归属',
    name: '别人的任务（明说不管）',
    text: '小刘说他明天去对接物流，老王负责周五的客户接待，这两块我就不管了。',
    tasks: [],
  },
  {
    id: 'D17',
    split: 'dev',
    scenario: '假阳性',
    name: '数字干扰项',
    text: '会议室改到三零一，参会的有十二个人，预算控制在四千二百块以内，项目编号是二零二六零八一七，联系电话尾号三三七八。',
    tasks: [],
  },
  {
    id: 'D18',
    split: 'dev',
    scenario: '无日期',
    name: '有任务但没日期',
    text: '记得把打印机的墨盒换了，另外把会议室的白板笔补一下。',
    tasks: [
      { keywords: ['墨盒', '打印'], dueDate: EVAL_TODAY },
      { keywords: ['白板笔', '白板'], dueDate: EVAL_TODAY },
    ],
  },
  {
    id: 'D19',
    split: 'dev',
    scenario: '中英混合',
    name: '中英混杂',
    text: '明天的 standup 我可能会晚点到。这个 sprint 的 retro 记得排一下，另外那个 PR 麻烦你 review 一下，deadline 是下周二。',
    tasks: [
      // 「回顾」是 retro 的常见中译，模型这么写不算错 —— 首轮评测因为漏了它
      // 被记成漏检，属于金标注的问题，不是模型的问题。
      { keywords: ['retro', '复盘', '回顾'] },
      { keywords: ['review', 'PR'], dueDate: '2026-08-25' },
    ],
    optionalTasks: [{ keywords: ['standup', '站会'] }],
  },
  {
    id: 'D20',
    split: 'dev',
    scenario: '口语改口',
    name: '强口语 / 改口',
    text: '呃…那个…就是明天，不对，是后天，后天下午我要去…嗯…去银行办对公账户那个事，然后…哦对，还有个事儿，就是那个啥来着…哦，打印材料，那个得提前弄。',
    tasks: [{ keywords: ['银行', '对公', '账户'], dueDate: '2026-08-22' }],
    optionalTasks: [{ keywords: ['打印', '材料'] }],
    forbiddenDates: ['2026-08-21'],
  },
  {
    id: 'D21',
    split: 'dev',
    scenario: '极短输入',
    name: '极短输入',
    text: '明天交周报。',
    tasks: [{ keywords: ['周报'], dueDate: '2026-08-21' }],
  },
  {
    id: 'D22',
    split: 'dev',
    scenario: '假阳性',
    name: '只有寒暄',
    text: '好的好的，行，那就这样，辛苦了，再见。',
    tasks: [],
  },
];

/* ----------------------------- 保留集 32 条 ----------------------------- */

const HOLDOUT_CASES: EvalCase[] = [
  {
    id: 'H01',
    split: 'holdout',
    scenario: '绝对日期',
    name: '带年份与不带年份的绝对日期',
    text: '2026年9月1日要交年度预算的初稿，九月十五号之前完成部门述职材料。',
    tasks: [
      { keywords: ['预算', '初稿'], dueDate: '2026-09-01' },
      { keywords: ['述职', '材料'], dueDate: '2026-09-15' },
    ],
  },
  {
    id: 'H02',
    split: 'holdout',
    scenario: '相对日期',
    name: '大后天 / 下下周',
    text: '大后天上午去体检，下下周二把季度总结交上去。',
    tasks: [
      { keywords: ['体检'], dueDate: '2026-08-23' },
      { keywords: ['总结', '季度'], dueDate: '2026-09-01' },
    ],
  },
  {
    id: 'H03',
    split: 'holdout',
    scenario: '相对日期',
    name: '这周末的两件事',
    text: '这周末抽空把家里的路由器换了，顺便把宽带续费也办了。',
    tasks: [
      { keywords: ['路由器'], dueDate: '2026-08-22' },
      { keywords: ['宽带', '续费'], dueDate: '2026-08-22' },
    ],
  },
  {
    id: 'H04',
    split: 'holdout',
    scenario: '模糊时间',
    name: '月底 / 下月初',
    text: '月底之前把库存盘点做完，下月初开始新的排班。',
    tasks: [
      { keywords: ['盘点', '库存'], dueDate: '2026-08-31' },
      { keywords: ['排班'], dueDate: '2026-09-01' },
    ],
  },
  {
    id: 'H05',
    split: 'holdout',
    scenario: '多任务',
    name: '一次列举五件事',
    text: '有几件事：周五交周报，下周一开项目启动会，八月三十一号提交预算，九月十号做客户回访，年底之前完成体系认证。',
    tasks: [
      { keywords: ['周报'], dueDate: '2026-08-21' },
      { keywords: ['启动会', '项目'], dueDate: '2026-08-24' },
      { keywords: ['预算'], dueDate: '2026-08-31' },
      { keywords: ['回访', '客户'], dueDate: '2026-09-10' },
      { keywords: ['认证', '体系'], dueDate: '2026-12-31' },
    ],
  },
  {
    id: 'H06',
    split: 'holdout',
    scenario: '周期任务',
    name: '每月某日 + 每两周',
    text: '每月十五号要交一次合规报告，每两周做一次代码评审。',
    tasks: [
      { keywords: ['合规', '报告'], dueDate: '2026-09-15', repeat: 'monthly' },
      { keywords: ['代码', '评审'], dueDate: '2026-08-24', repeat: 'biweekly' },
    ],
  },
  {
    id: 'H07',
    split: 'holdout',
    scenario: '周期任务',
    name: '每个工作日',
    text: '从这周起每个工作日早上都要检查一遍备份任务的状态。',
    tasks: [
      { keywords: ['备份', '检查'], dueDate: EVAL_TODAY, repeat: 'weekdays' },
    ],
  },
  {
    id: 'H08',
    split: 'holdout',
    scenario: '完成状态',
    name: '已完成与未完成混在一句',
    text: '合同已经签完了，发票也开好了，但是尾款还没催，下周三之前得跟财务对一下。',
    tasks: [{ keywords: ['尾款', '财务'], dueDate: '2026-08-26' }],
  },
  {
    id: 'H09',
    split: 'holdout',
    scenario: '任务归属',
    name: '别人的任务与自己的任务混合',
    text: '小周负责联系场地，我这边把邀请函的名单整理出来，下周五之前发给他。',
    tasks: [{ keywords: ['邀请函', '名单'], dueDate: '2026-08-28' }],
  },
  {
    id: 'H10',
    split: 'holdout',
    scenario: '边界',
    name: '条件句，做与不做取决于对方',
    text: '如果客户那边周三之前确认了方案，我们就下周开始动工；没确认的话再等等。',
    tasks: [],
    optionalTasks: [
      { keywords: ['确认', '方案', '客户'] },
      { keywords: ['动工', '开工'] },
    ],
  },
  {
    id: 'H11',
    split: 'holdout',
    scenario: '假阳性',
    name: '取消与推迟',
    text: '上次说的那个市场调研先不做了，预算被砍掉了；培训也推迟，等通知吧。',
    tasks: [],
  },
  {
    id: 'H12',
    split: 'holdout',
    scenario: '假阳性',
    name: '订单号与金额干扰',
    text: '订单号是二零二六零八一九零三，金额四千五百六十元，走的是三号仓库，快递单尾号八八九一。',
    tasks: [],
    forbiddenDates: ['2026-08-19', '2026-09-03', '2026-08-03'],
  },
  {
    id: 'H13',
    split: 'holdout',
    scenario: '假阳性',
    name: '通话寒暄',
    text: '喂，能听见吗？行行行，那我们就先这样，下次再聊，拜拜。',
    tasks: [],
  },
  {
    id: 'H14',
    split: 'holdout',
    scenario: '极短输入',
    name: '极短，带日期',
    text: '下周一交年假申请。',
    tasks: [{ keywords: ['年假', '申请'], dueDate: '2026-08-24' }],
  },
  {
    id: 'H15',
    split: 'holdout',
    scenario: '无日期',
    name: '极短，无日期',
    text: '记得买牛奶。',
    tasks: [{ keywords: ['牛奶'], dueDate: EVAL_TODAY }],
  },
  {
    id: 'H16',
    split: 'holdout',
    scenario: '长文本',
    name: '完整周会记录，含已完成项与周期项',
    text: '这次周会我快速过一下几件事。第一，上周的线上故障复盘已经写完了，就不再占用时间。第二，新的埋点方案需要跟数据组对齐，我周五之前把文档发出去。第三，下周一的季度汇报，PPT 我今天晚上先出一版初稿。第四，采购那边的服务器报价单，八月二十八号之前要提交给财务。最后，大家记得每周五下班前更新一下自己的进度表。',
    tasks: [
      { keywords: ['埋点', '文档'], dueDate: '2026-08-21' },
      { keywords: ['PPT', '汇报', '初稿'], dueDate: EVAL_TODAY },
      { keywords: ['报价单', '服务器', '采购'], dueDate: '2026-08-28' },
      { keywords: ['进度表', '进度'], repeat: 'weekly' },
    ],
  },
  {
    id: 'H17',
    split: 'holdout',
    scenario: '中英混合',
    name: '中英混合，含无日期任务',
    text: '这个 sprint 的 release note 我来写，下周三之前发出去；另外 QA 那边的 test plan 麻烦 review 一下。',
    tasks: [
      {
        keywords: ['release note', 'release', '发布说明'],
        dueDate: '2026-08-26',
      },
      { keywords: ['test plan', 'review', '测试'], dueDate: EVAL_TODAY },
    ],
  },
  {
    id: 'H18',
    split: 'holdout',
    scenario: '委婉语气',
    name: '疑问句形式的任务',
    text: '我们是不是该在九月三号之前把服务条款更新一版？另外隐私政策也得同步改一下。',
    tasks: [
      { keywords: ['服务条款', '条款'], dueDate: '2026-09-03' },
      { keywords: ['隐私'], dueDate: EVAL_TODAY },
    ],
  },
  {
    id: 'H19',
    split: 'holdout',
    scenario: '任务归属',
    name: '转述他人要求，仍是自己的任务',
    text: '老板让我这周五之前把三季度的人力预算重新做一版。',
    tasks: [{ keywords: ['人力', '预算'], dueDate: '2026-08-21' }],
  },
  {
    id: 'H20',
    split: 'holdout',
    scenario: '相对日期',
    name: '改期，原日期不应保留',
    text: '原定明天的评审推迟到下周四，材料也顺延到那天交。',
    tasks: [{ keywords: ['评审'], dueDate: '2026-08-27' }],
    optionalTasks: [{ keywords: ['材料'], dueDate: '2026-08-27' }],
    forbiddenDates: ['2026-08-21'],
  },
  {
    id: 'H21',
    split: 'holdout',
    scenario: '无日期',
    name: '有空再做，无明确日期',
    text: '有空的时候把工位整理一下，不着急。',
    tasks: [{ keywords: ['工位', '整理'], dueDate: EVAL_TODAY }],
  },
  {
    id: 'H22',
    split: 'holdout',
    scenario: '绝对日期',
    name: '跨年日期',
    text: '明年一月五号要参加行业年会，一月十号之前把演讲稿准备好。',
    tasks: [
      { keywords: ['年会', '行业'], dueDate: '2027-01-05' },
      { keywords: ['演讲稿', '演讲'], dueDate: '2027-01-10' },
    ],
  },
  {
    id: 'H23',
    split: 'holdout',
    scenario: '绝对日期',
    name: '节假日表述 + 绝对日期',
    text: '国庆之后安排一次全员会，十月十二号那周开。',
    tasks: [{ keywords: ['全员会', '全员', '会'], dueDate: '2026-10-12' }],
  },
  {
    id: 'H24',
    split: 'holdout',
    scenario: '同日多任务',
    name: '同一天两个时间点',
    text: '今天下午三点跟设计对一版稿子，五点半之前把结论同步到群里。',
    tasks: [
      { keywords: ['设计', '稿'], dueDate: EVAL_TODAY },
      { keywords: ['结论', '同步'], dueDate: EVAL_TODAY },
    ],
  },
  {
    id: 'H25',
    split: 'holdout',
    scenario: '委婉语气',
    name: '极度客气的请求',
    text: '那份年度总结，如果你这两天有时间的话，帮我过一眼就行，不用太仔细。',
    tasks: [{ keywords: ['年度总结', '总结'] }],
  },
  {
    id: 'H26',
    split: 'holdout',
    scenario: '隐晦任务',
    name: '抱怨式，长期未处理',
    text: '服务器的监控告警配了半年了一直没人管，天天误报，实在受不了了。',
    tasks: [{ keywords: ['告警', '监控'] }],
  },
  {
    id: 'H27',
    split: 'holdout',
    scenario: '隐晦任务',
    name: '外部压力式待办',
    text: '客户已经催了三次了，那个集成方案的报价还没给出去。',
    tasks: [{ keywords: ['报价', '集成'] }],
  },
  {
    id: 'H28',
    split: 'holdout',
    scenario: '边界',
    name: '待确认事项',
    text: '会议室还没定下来，我等下问一下行政，如果周三还没消息就改成线上。',
    tasks: [{ keywords: ['会议室', '行政'] }],
  },
  {
    id: 'H29',
    split: 'holdout',
    scenario: '多任务',
    name: '回邮件 + 前置确认',
    text: '王总的邮件我还没回，里面提到的三个问题得先跟技术确认，下周一之前回过去。',
    tasks: [{ keywords: ['邮件', '王总', '回'], dueDate: '2026-08-24' }],
    optionalTasks: [{ keywords: ['技术', '确认'] }],
  },
  {
    id: 'H30',
    split: 'holdout',
    scenario: '去重',
    name: '同一件事三种说法',
    text: '那个新版本的上线，就是 v2.1 那个发布，发版的事儿，下周五之前必须搞定。',
    tasks: [
      { keywords: ['上线', '发布', '发版', 'v2.1'], dueDate: '2026-08-28' },
    ],
  },
  {
    id: 'H31',
    split: 'holdout',
    scenario: '假阳性',
    name: '纯数据同步',
    text: '简单同步一下，上周的活跃用户是一万两千，留存率百分之三十八，比上个月好一点。没别的了。',
    tasks: [],
  },
  {
    id: 'H32',
    split: 'holdout',
    scenario: '周期任务',
    name: '周期任务与一次性任务并存',
    text: '以后每周一早上开站会，另外这周五之前把会议室的预定权限申请下来。',
    tasks: [
      { keywords: ['站会'], dueDate: '2026-08-24', repeat: 'weekly' },
      { keywords: ['权限', '预定', '申请'], dueDate: '2026-08-21' },
    ],
  },
];

export const EVAL_CASES: EvalCase[] = [...DEV_CASES, ...HOLDOUT_CASES];

export default EVAL_CASES;
