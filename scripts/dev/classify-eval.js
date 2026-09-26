/* eslint-disable import/no-dynamic-require, global-require, no-restricted-syntax, no-await-in-loop, no-console */
// 开发期脚本：故意用动态 require（要按仓库根目录定位 Electron 版 better-sqlite3
// 和 TypeScript 源码）并串行 await 调模型，本地模型并发只会互相抢显存。
/**
 * 笔记分类的离线评测：一组带标准答案的样例，直接打本地 Ollama。
 *
 * 样例覆盖真实用法里最容易混的几类：会议里夹着个人提醒、个人事务里提到别人、
 * 纯记录事实、以及很短的碎片。改 prompt 之后重跑这个脚本就知道有没有变差。
 *
 * 用法（需先启动 Ollama）：
 *   ELECTRON_RUN_AS_NODE=1 npx electron scripts/dev/classify-eval.js [模型名]
 *   node 也能跑（这个脚本不碰数据库）：node scripts/dev/classify-eval.js [模型名]
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { Ollama } = require(path.join(ROOT, 'node_modules/ollama'));

require(path.join(ROOT, 'node_modules/ts-node')).register({
  compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
  transpileOnly: true,
});
const { buildCategoryPrompt, parseCategory } = require(
  path.join(ROOT, 'src/main/dashboard/NoteCategoryPrompt.ts'),
);

const MODEL =
  process.argv[2] || process.env.SPEAKSPACE_MODEL || 'qwen2.5:3b-instruct';

const CASES = [
  {
    expected: 'meeting',
    text: '会议室改到301，有12个人参加。小张负责讲一下这个季度的数据，我来补充一下下半年的排期。会后把纪要发群里。',
  },
  {
    expected: 'meeting',
    text: '小刘说他明天去对接物流那边，小王负责把报价单整理出来发给客户。我这边跟进合同。周五之前都要弄完。',
  },
  {
    expected: 'meeting',
    text: '刚才跟客户过了一遍需求，他们希望登录能支持手机号验证码，付款页面要加发票信息。研发那边评估一下工作量。',
  },
  {
    expected: 'meeting',
    text: '今天的会主要是同步一下上半年的情况，营收涨了百分之十二，市场那边说下半年预算不会加。会议结束前老板提醒大家填一下考勤。',
  },
  {
    expected: 'personal',
    text: '呃那个，就是明天要去银行办一下对公账号，得带营业执照和身份证复印件。对不对是后天来着，反正这周得办完。',
  },
  {
    expected: 'personal',
    text: '记一下，牙医周三下午三点复诊，还有猫粮快没了要买，水电费这个月还没交。',
  },
  {
    expected: 'personal',
    text: '明天的 Stand Up 我可能会晚到十分钟，先跟王姐说一声。另外保险还没续，得抽空打电话问问。',
  },
  {
    expected: 'idea',
    text: '突然想到一个点子，能不能让笔记自动按场景分类，比如会议、个人事务。再往下想，说不定还能根据分类推荐不同的模板，这个可以做成卖点。',
  },
  {
    expected: 'idea',
    text: '如果我们做一个给自由职业者用的报价工具会怎么样，输入工时和成本自动生成报价单，说不定还能接支付。先随便想想。',
  },
  {
    expected: 'learning',
    text: '今天看的这节课讲的是索引，B 树的高度决定了查询要读几次磁盘，所以主键最好短一点。联合索引遵循最左前缀原则。',
  },
  {
    expected: 'learning',
    text: '读到一篇讲注意力机制的论文，核心是把查询、键、值三个矩阵做点积再归一化，复杂度是序列长度的平方，所以长文本要做稀疏化。',
  },
  {
    expected: 'general',
    text: '我想问一下太阳表面的温度有多少。',
  },
  {
    expected: 'general',
    text: '你好你好，今天是2026年8月13号，然后我想说，就是英国布里斯托那边的天气怎么样。',
  },
];

async function main() {
  const ollama = new Ollama();
  let correct = 0;
  const confusion = [];

  // 串行跑：本地模型并发只会互相抢显存。
  for (const item of CASES) {
    // eslint-disable-next-line no-await-in-loop
    const response = await ollama.chat({
      model: MODEL,
      messages: [{ role: 'user', content: buildCategoryPrompt(item.text) }],
      stream: false,
      options: { temperature: 0 },
    });
    const raw = (response.message?.content || '').trim();
    const got = parseCategory(raw) || 'uncategorized';
    const ok = got === item.expected;
    if (ok) correct += 1;
    else
      confusion.push(`${item.expected} -> ${got}: ${item.text.slice(0, 30)}…`);
    console.log(
      `${ok ? 'OK  ' : 'MISS'} expected=${item.expected.padEnd(8)} got=${got.padEnd(13)} ${item.text.slice(0, 28)}…`,
    );
  }

  console.log(`\nModel: ${MODEL}`);
  console.log(`Accuracy: ${correct}/${CASES.length}`);
  if (confusion.length) console.log(`\nMisses:\n  ${confusion.join('\n  ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
