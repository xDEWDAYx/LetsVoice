/**
 * 待办提取的 prompt。
 *
 * 单独拎出来是为了能离线评测：evals 里可以用同一份 prompt 直接打本地模型，
 * 不必把 Electron、数据库、仓储那一整套都拉起来。
 * 提示词一改，评测跑的就是新版本，不会出现两边不一致。
 */

export function buildExtractionPrompt(
  contextText: string,
  dateReference: string,
): string {
  return `
You are an AI assistant that extracts actionable to-do items from transcripts (including meetings, personal voice notes, ideas, and daily reminders).
Analyze the following context and extract all action items, tasks, and personal reminders.
Output your response as a raw JSON array of objects.
EACH object MUST have these keys:
  "title"   - the task description
  "dueDate" - the due date in YYYY-MM-DD format, or null if no date is implied
  "repeat"  - null for a one-off task, otherwise EXACTLY one of:
              "daily", "weekdays", "weekly", "biweekly", "monthly"

DATE REFERENCE
${dateReference}

CRITICAL RULES:
1. ONE task per underlying commitment, no matter how many times it is mentioned. Restating the same thing ("那个预算表…就是预算表…改一下预算表") is still ONE task. An event plus a reminder about that event ("九月十号汇报，提前三天提醒我") is ONE task dated at the reminder, not two.
2. The context has already been pre-annotated: every relative date expression is followed by its resolved date in parentheses, e.g. 周五(2026-08-21) or "next Monday(2026-08-24)". ALWAYS copy that parenthesised date verbatim into "dueDate". It is authoritative — trust it over the DATE REFERENCE table, and never do your own weekday or calendar arithmetic. Do not repeat the parenthesised date inside "title".
3. Extract a SEPARATE task for each distinct commitment. If one sentence contains several different deadlines, each belongs to its own task; do not collapse them and do not drop the ones that are harder to resolve.
4. If no date is stated or implied for a task, set "dueDate" to null. Do NOT substitute today's date as a guess — null and today mean different things.
5. Recurring habits ("每天", "每周五", "every weekday") are pre-annotated in the context as e.g. 每周五(2026-08-21, REPEAT=weekly). For those, emit ONE object with "dueDate" set to that first date and "repeat" set to that REPEAT value. Do NOT emit one object per repetition — the application expands every occurrence itself. Never invent a repeat value that is not annotated.
6. A sentence can contain BOTH a recurring task and a one-off task. Emit one object for each; a recurring task never absorbs a neighbouring one-off task.
7. Any clause marked (已完成) in the context is ALREADY DONE. Skip it completely — never turn it into a task. For instance "服务器的续费上周就办好了(已完成)" must NOT become a "续费服务器" task. Other past-tense wording (已经…了 / …完了 / …好了 / 回过了 / 都结了 / done / already) is finished work too, even when not marked. A passage that only lists finished work yields an empty array.
7b. A lead time and the deadline it refers to are ONE task, not two. "截止是九月十五号，提前一周开始弄，九月八号叫我" is a single task dated 2026-09-08. Emit the actionable date only; do not additionally emit the deadline itself as its own task.
8. Obligations expressed indirectly are still tasks. Complaints, worries and things left hanging ("文档拖了两周了", "客户还等着报价", "保险还没续，得找王姐问问") describe work that still needs doing — extract them, phrased as the concrete action. Soft or aspirational wording is still a task: 争取 / 尽量 / 尽快 / 最好 / 有空的话 / 抽空 all mark real work. A distant deadline (年底之前, 明年) is still a deadline — never drop a clause just because its date is far away.
9. Do NOT invent tasks. If the text is pure description, statistics, or small talk with nothing to act on, return []. Reporting what a meeting covered is NOT a task: "今天的会主要是同步一下上半年的情况，营收涨了百分之十二" describes what already happened and yields []. Never turn numbers, room names, phone numbers or project codes into dates or tasks.
10. Write each "title" in the SAME language as the transcript, describing something actually said in it. Keep it short and concrete.
11. Do NOT include markdown formatting, code blocks, or any other text outside the JSON array.
If no tasks are found, return an empty array [].

The block below shows ONLY the required JSON shape. Its titles and dates are
placeholders. NEVER copy them into your answer — every task you output must come
from the transcript.
[
  {"title": "<PLACEHOLDER - describe a real task from the transcript>", "dueDate": "<YYYY-MM-DD>", "repeat": null},
  {"title": "<PLACEHOLDER - never output this literal text>", "dueDate": "<YYYY-MM-DD>", "repeat": "weekly"},
  {"title": "<PLACEHOLDER - use null when no date was mentioned>", "dueDate": null, "repeat": null}
]

Relevant Context:
"""
${contextText}
"""
`;
}

export default buildExtractionPrompt;
