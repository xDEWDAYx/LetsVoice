/**
 * 逐模型的提示词档案。
 *
 * 为什么需要：横向扫描的第一轮里，所有模型都用同一套为 `qwen2.5` 调过的提示词。
 * 于是「某个模型表现差」和「某个模型不适应这套提示词」这两件事分不开 ——
 * 那是那轮对比最大的局限。这个文件就是用来消除它的。
 *
 * **调优纪律**：变体的选择只允许在开发集（22 条）上做，保留集（32 条）全程冻结。
 * 一旦用保留集的结果去挑变体，它就退化成第二个开发集，跨模型的比较也就不再可信。
 * tune-prompts.ts 强制只跑 `--split dev`。
 *
 * 变体是「在原提示词上追加一段规则」，而不是重写：
 *  - 线上那份提示词是唯一的真实来源，不能因为评测而分叉；
 *  - 追加的内容看得见、可 diff，报告里能逐条说明每个模型加了什么。
 */

/* eslint-disable no-restricted-syntax */

export type PromptVariant = {
  id: string;
  /** 报告里用来说明「这个模型加了什么」。 */
  describe: string;
  /** 针对的失败模式，写清楚为什么加。 */
  targets: string;
  /** 追加到原提示词里的额外规则。空串表示不改。 */
  extraRules: string;
};

/**
 * 追加位置固定在 `Relevant Context:` 之前 —— 那是原提示词里最后一段说明文字，
 * 插在它前面可以保证额外规则仍在「指令区」，不会被误读成待处理的文本。
 */
export function applyVariant(prompt: string, variant: PromptVariant): string {
  if (!variant.extraRules.trim()) return prompt;
  const anchor = 'Relevant Context:';
  const index = prompt.lastIndexOf(anchor);
  const block = `\nADDITIONAL RULES (model-specific):\n${variant.extraRules.trim()}\n\n`;
  if (index === -1) return `${prompt}${block}`;
  return prompt.slice(0, index) + block + prompt.slice(index);
}

export const PROMPT_VARIANTS: PromptVariant[] = [
  {
    id: 'baseline',
    describe: '不追加任何规则，与线上提示词完全一致',
    targets: '对照组',
    extraRules: '',
  },
  {
    id: 'strict-empty',
    describe: '强化「没有待办就返回空数组」，并给出一个反例',
    targets:
      '零任务假阳性率高的模型 —— 在纯陈述、寒暄、数字干扰的文本上凭空造出任务',
    extraRules: `A. Returning an empty array is a CORRECT and COMMON answer. Many transcripts contain no task at all.
B. Before emitting any object, ask: "did the speaker commit to doing something that is not yet done?" If the answer is no, emit nothing for that clause.
C. These are NOT tasks: describing what a meeting covered, reporting numbers or statistics, small talk and greetings, room numbers, phone numbers, order codes, amounts of money, and anything already finished.
D. Worked example — transcript: "会议室改到三零一，参会的有十二个人，预算控制在四千二百块以内。" Correct output: []
E. Do not invent a task merely because the text mentions a date, a number, or a person's name.`,
  },
  {
    id: 'recall-boost',
    describe: '强化「每个独立承诺都要单独抽出」，并点名易漏的软性表述',
    targets: '召回率低的模型 —— 整条漏掉，或把多个并列承诺压成一条',
    extraRules: `A. Extract EVERY distinct commitment separately. Two actions joined by "并"/"和"/"，" are still two tasks if they can be done independently and could have different dates.
B. Do NOT merge a list into one object. "换路由器并办理宽带续费" is TWO tasks, not one.
C. Soft wording is still a task: 有空的时候 / 抽空 / 争取 / 尽量 / 最好 / 记得 / 别忘了 / 帮我看一眼 all mark real work.
D. Very short inputs still contain tasks: "记得买牛奶。" yields exactly one task.
E. A distant deadline (年底之前, 明年) is still a deadline. Never drop a clause because its date is far away.`,
  },
  {
    id: 'json-only',
    describe: '收紧输出格式，禁止任何 JSON 以外的内容',
    targets: '输出里夹带解释文字、markdown 代码块，导致解析失败的模型',
    extraRules: `A. Your entire reply MUST be a single JSON array and nothing else.
B. Do not write any explanation, preamble, apology, or summary before or after the array.
C. Do not wrap the array in a markdown code fence.
D. Do not emit trailing commas. Every key and string value must use double quotes.
E. If there is nothing to extract, reply with exactly: []`,
  },
  {
    id: 'strict-empty+json-only',
    describe: '同时收紧空数组与输出格式',
    targets: '既会凭空造任务、输出格式又不稳的模型',
    extraRules: `A. Returning an empty array is a CORRECT and COMMON answer. If no commitment was made, reply with exactly: []
B. These are NOT tasks: describing what a meeting covered, statistics, small talk, room or order numbers, and anything already finished.
C. Your entire reply MUST be a single JSON array and nothing else — no explanation, no markdown fence.
D. Worked example — transcript: "今天的会主要是同步一下上半年的情况，营收涨了百分之十二。" Correct output: []`,
  },
  {
    id: 'recall+json-only',
    describe: '同时强化召回与输出格式',
    targets: '漏抽严重、输出格式又不稳的模型',
    extraRules: `A. Extract EVERY distinct commitment separately; two actions joined by "并"/"和" are two tasks.
B. Soft wording is still a task: 有空的时候 / 抽空 / 争取 / 记得 / 帮我看一眼.
C. Very short inputs still contain tasks: "记得买牛奶。" yields exactly one task.
D. Your entire reply MUST be a single JSON array and nothing else — no explanation, no markdown fence.`,
  },
];

export function findVariant(id: string): PromptVariant {
  const hit = PROMPT_VARIANTS.find((item) => item.id === id);
  if (!hit) {
    throw new Error(
      `未知的提示词变体 ${id}。可选：${PROMPT_VARIANTS.map((item) => item.id).join('、')}`,
    );
  }
  return hit;
}
