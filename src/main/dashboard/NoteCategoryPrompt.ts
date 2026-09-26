/**
 * 笔记类型识别的 prompt 与结果解析。
 *
 * 和 TodoExtractionPrompt 一样单独拎出来：脚本可以拿同一份 prompt 直接打本地
 * 模型做离线评测，不必把 Electron 和数据库拉起来，提示词一改评测跑的就是新版。
 */

/** 与渲染层 DashboardCategoryKey 一一对应，改这里必须同步改那边。 */
export const NOTE_CATEGORY_KEYS = [
  'meeting',
  'personal',
  'idea',
  'learning',
  'general',
] as const;

export type NoteCategoryKey = (typeof NOTE_CATEGORY_KEYS)[number];

/** 分类失败 / 尚未分类时落库的值。 */
export const UNCATEGORIZED = 'uncategorized';

/**
 * 送进模型的转写长度上限。
 *
 * 判断类型只需要开头一段就够（说话人往往一上来就点明场合），
 * 截断既省一大截推理时间，也避免长转录把小模型带偏。
 */
export const CATEGORY_INPUT_LIMIT = 1200;

export function buildCategoryPrompt(transcript: string): string {
  const excerpt = transcript.trim().slice(0, CATEGORY_INPUT_LIMIT);
  return `You classify a voice note into EXACTLY ONE category.
Answer with the category id only — one lowercase word, nothing else.

CATEGORIES
- meeting  : a discussion involving other people at work — meetings, reviews,
             stand-ups, client calls, task hand-outs to teammates, decisions
             made together. Third-person names doing work ("小刘说他去对接物流")
             are a strong signal.
- personal : the speaker talking to themselves about their own life or errands —
             reminders, appointments, shopping, bills, paperwork, health, travel.
             First person, no colleagues involved.
- idea     : brainstorming, product or content ideas, "what if we…", drafts of a
             plan that is still being invented rather than reported.
- learning : notes taken while studying — lectures, tutorials, books, papers,
             technical explanations the speaker is recording to remember.
- general  : anything that does not clearly fit the four above — questions the
             speaker is asking out loud (weather, prices, facts), greetings,
             one-liners, short fragments, and plain logging of facts.

RULES
1. Pick the dominant purpose of the note as a whole, not a single sentence.
   A meeting that ends with a personal reminder is still "meeting".
2. Containing to-dos does NOT decide the category. Both meetings and personal
   notes are full of to-dos; decide by WHO the note is about instead.
3. Merely naming another person does not make a note a "meeting". A meeting is
   work being discussed, decided or handed out among people; telling one person
   something, or a reminder that happens to involve someone, stays "personal".
4. A note that is only a question, a greeting, or a couple of sentences of
   chatter — no plan of the speaker's own, no discussion, no study material —
   is "general". Asking a factual question is NOT "learning"; learning means
   the speaker is recording an explanation, not requesting one. "我想问一下太阳
   表面的温度有多少" and "最新的平板电脑价格是多少" are both "general".
5. Otherwise, when two categories are equally plausible, prefer the more
   specific one over "general".
6. Output one of: ${NOTE_CATEGORY_KEYS.join(' | ')}
   No punctuation, no explanation, no quotes, no markdown.

Note:
"""
${excerpt}
"""`;
}

/**
 * 从模型输出里取分类。
 *
 * 小模型经常不听「只输出一个词」，会带上 "Category: meeting." 或一段解释，
 * 所以按 key 在文本里找，而不是要求整段完全相等；找不到就当分类失败。
 */
export function parseCategory(raw: string): NoteCategoryKey | null {
  const text = (raw ?? '').toLowerCase();
  const hits = NOTE_CATEGORY_KEYS.filter((key) =>
    new RegExp(String.raw`\b${key}\b`).test(text),
  );
  // 输出里同时出现多个分类词，多半是模型在复述选项或权衡，不能瞎猜。
  if (hits.length !== 1) return null;
  return hits[0];
}

export default buildCategoryPrompt;
