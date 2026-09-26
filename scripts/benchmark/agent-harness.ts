/**
 * Agent 的外层脚手架（harness）。
 *
 * 待办提取那一轮的经验直接搬过来：能用代码兜住的就不要指望提示词，
 * 能拆成简单子任务的就不要让模型在一次推理里同时完成。
 *
 * 对准的是评测里量出来的四个失败模式（均为三轮稳定出现）：
 *
 *   歧义澄清 0.0%      —— 该问「你指哪一个」时自行猜一个
 *   无答案任务 8.3%     —— 该说「笔记里没有」时硬答
 *   Read coverage 0%   —— 只看 240 字搜索预览，不打开完整笔记核对
 *   工具调用意愿悬殊    —— phi4-mini 每任务 0.02 次，等于完全不用工具
 *
 * **不改生产代码**：全部通过 `AgentOrchestrator` 已有的 `systemPrompt` 注入点
 * 和直接调用工具对象来实现。生产链路一行未动，评测测的仍是真实编排器。
 */

/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */

import type { AgentContext, AgentTool } from '../../src/main/agent/AgentTypes';

export type AgentHarnessOptions = {
  /** 预载：先替模型跑一次检索并读取前 N 条笔记，0 表示关闭。 */
  preload: number;
  /** 歧义路由：先判断问题本身是否指代不清，是则要求先澄清。 */
  router: boolean;
  /** 证据核查：预载之后判断证据够不够，不够则要求明确说找不到。 */
  evidenceCheck: boolean;
};

export const AGENT_HARNESS_OFF: AgentHarnessOptions = {
  preload: 0,
  router: false,
  evidenceCheck: false,
};

/** `--harness preload2,router,evidence` */
export function parseAgentHarness(
  spec: string | undefined,
): AgentHarnessOptions {
  if (!spec || spec === 'off') return { ...AGENT_HARNESS_OFF };
  const parts = spec.split(',').map((item) => item.trim().toLowerCase());
  const preloadToken = parts.find((item) => /^preload\d*$/.test(item));
  return {
    preload: preloadToken ? Number(preloadToken.slice(7) || 2) : 0,
    router: parts.includes('router'),
    evidenceCheck: parts.includes('evidence'),
  };
}

export function describeAgentHarness(options: AgentHarnessOptions): string {
  const parts: string[] = [];
  if (options.preload > 0) parts.push(`强制检索并读取前 ${options.preload} 条`);
  if (options.router) parts.push('歧义路由');
  if (options.evidenceCheck) parts.push('证据核查');
  return parts.length > 0 ? parts.join(' + ') : '无（对照组）';
}

/* ------------------------------- 歧义路由 ------------------------------- */

/**
 * 只看问题本身，不看笔记。
 *
 * 歧义是**问题的属性**：「那个项目进展怎么样」在库里有三个项目时就是歧义，
 * 跟检索结果无关。所以这一步可以前置，而且只需要一次很短的调用。
 *
 * 和待办门控一样用少样本对照而不是抽象规则 —— 实测小模型对
 * 「照着例子判断」远比对「理解定义」可靠。
 */
export function buildRouterPrompt(instruction: string): string {
  return `Decide whether a question can be answered directly, or whether it is too vague to answer without asking back.

Answer AMBIGUOUS only when the question refers to something by a pronoun or a generic word ("that project", "the meeting", "他") and the notes could plausibly contain several different matches.

Example 1
Question: "What did we decide about the Helios launch date?"
Answer: DIRECT

Example 2
Question: "那个项目现在进展怎么样了？"
Answer: AMBIGUOUS

Example 3
Question: "List the action items from the Northwind support call."
Answer: DIRECT

Example 4
Question: "他上次说的那个问题解决了吗？"
Answer: AMBIGUOUS

Now answer for the question below. Reply with exactly one word: DIRECT or AMBIGUOUS.

Question: "${instruction}"
Answer:`;
}

export function readRouter(raw: string): 'direct' | 'ambiguous' {
  return /ambiguous/i.test(raw) ? 'ambiguous' : 'direct';
}

/* ------------------------------- 证据核查 ------------------------------- */

/**
 * 预载证据之后，问一句「这些材料够不够回答」。
 *
 * 「无答案任务完成率 8.3%」的成因是：模型拿到一堆看似相关的笔记预览，
 * 就顺着编一个答案出来。把「够不够」单独拎出来问，是个二分类判断，
 * 比让它在生成答案的同时自我克制容易得多 —— 与待办门控同一个道理。
 */
export function buildEvidencePrompt(
  instruction: string,
  evidence: string,
): string {
  return `You are checking whether some notes contain the answer to a question.

Question: "${instruction}"

Notes:
"""
${evidence || '(no notes were found)'}
"""

Does the material above actually contain the information needed to answer the question?
Reply with exactly one word: ENOUGH or MISSING.
Answer:`;
}

export function readEvidence(raw: string): 'enough' | 'missing' {
  return /missing/i.test(raw) ? 'missing' : 'enough';
}

/* --------------------------------- 预载 --------------------------------- */

type SearchHit = { id: number; name?: string };

/**
 * 替模型跑一次检索并读取前 N 条完整笔记。
 *
 * 为什么用代码做而不是要求模型做：实测 `phi4-mini` 每任务只调 0.02 次工具，
 * `qwen2.5:1.5b` 只调 0.13 次 —— 提示词写得再清楚也叫不动它们。
 * 而「先检索再读证据」是这个任务里固定不变的第一步，本来就不需要模型决策。
 *
 * 注意这只提供**候选**证据，不提供答案：检索用的是模型面对的同一个查询，
 * 命中什么就给什么，命中不了就给空，不会把金标笔记塞进去。
 */
export async function preloadEvidence(
  tools: AgentTool[],
  context: AgentContext,
  instruction: string,
  topK: number,
): Promise<{ evidence: string; searchedIds: number[]; readIds: number[] }> {
  const search = tools.find(
    (tool) => tool.schema.function?.name === 'search_notes',
  );
  const read = tools.find((tool) => tool.schema.function?.name === 'read_note');
  if (!search || !read) {
    return { evidence: '', searchedIds: [], readIds: [] };
  }

  let hits: SearchHit[] = [];
  try {
    const raw = await search.run({ query: instruction }, context);
    const parsed = JSON.parse(raw) as { notes?: SearchHit[] };
    hits = parsed.notes ?? [];
  } catch {
    return { evidence: '', searchedIds: [], readIds: [] };
  }

  const chosen = hits.slice(0, topK);
  const blocks: string[] = [];
  const readIds: number[] = [];
  for (const hit of chosen) {
    try {
      const raw = await read.run({ note_id: hit.id }, context);
      const note = JSON.parse(raw) as { name?: string; transcript?: string };
      blocks.push(
        `--- note ${hit.id}: ${note.name ?? hit.name ?? ''}\n${note.transcript ?? ''}`,
      );
      readIds.push(hit.id);
    } catch {
      continue;
    }
  }
  return {
    evidence: blocks.join('\n\n'),
    searchedIds: hits.map((hit) => hit.id),
    readIds,
  };
}

/* ---------------------------- 系统提示词增补 ---------------------------- */

/**
 * 把脚手架的产物拼成一段附加系统提示词，接在生产提示词后面。
 *
 * 刻意放在最后而不是替换：生产的分层提示词仍然完整生效，
 * 这样评测测的还是线上那套规则，脚手架只是额外补了几条。
 */
export function buildHarnessBlock(input: {
  mode: 'direct' | 'ambiguous';
  evidenceVerdict: 'enough' | 'missing' | null;
  evidence: string;
  readIds: number[];
}): string {
  const lines: string[] = ['', '[L6] HARNESS  (适用范围 / scope: 本次运行)'];
  let index = 1;
  const push = (text: string) => {
    lines.push(`  L6.${index} ${text}`);
    index += 1;
  };

  if (input.mode === 'ambiguous') {
    push(
      'This question is ambiguous: it refers to something that could match several different notes. ' +
        'Do NOT pick one and answer. Ask the user exactly one short clarifying question naming the candidates, then stop.',
    );
  }
  if (input.evidenceVerdict === 'missing') {
    push(
      'A check has already established that the retrieved notes do NOT contain the answer. ' +
        'Say plainly that you could not find it in the notes. Do not guess, and do not substitute a related fact.',
    );
  }
  if (input.evidence) {
    push(
      `The following notes were already retrieved and read for you (ids ${input.readIds.join(', ')}). ` +
        'Treat them as the primary evidence; you do not need to search or read them again.',
    );
    lines.push('');
    lines.push('[RETRIEVED NOTE CONTEXT]');
    lines.push(input.evidence);
  }
  return lines.length > 2 ? lines.join('\n') : '';
}
