import { extractCoreNoteTimeExpression } from "./core-note-time.ts";

export type StructuredCompletionSignals = {
  truncated?: boolean;
  stopped_limit?: number;
  stopped_eos?: boolean;
  context_full?: boolean;
  tokens_predicted?: number;
};

export type StructuredStageResult = {
  raw: string;
  hitOutputLimit: boolean;
};

export type AdaptiveCompletionMode = "normal" | "expanded";

type UnknownItem = Record<string, unknown>;

export type SanitizedIntentOutput = {
  tasks: UnknownItem[];
};

export type AdaptiveBatchResult<T> = {
  values: { input: string; value: T }[];
  failures: { input: string; reason: "invalid-json" | "output-limit" }[];
};

const MAX_INTENT_CLAUSES_PER_CHUNK = 6;
const MAX_INTENT_CHARS_PER_CHUNK = 1_100;
const MAX_RECOVERY_DEPTH = 8;
const MIN_RECOVERY_SPLIT_CHARACTERS = 240;
const MAX_FALLBACK_SUMMARY_CHARS = 800;
const MAX_FALLBACK_KEY_POINTS = 8;
const MAX_FALLBACK_KEY_POINT_CHARS = 240;
const TASK_RECURRENCE_ANNOTATION = /\((\d{4}-\d{2}-\d{2}),\s*REPEAT=(daily|weekdays|weekly|biweekly|monthly)\)/iu;

function recurrenceEvidence(value: string): { firstDate: string; kind: string } | null {
  const match = value.match(TASK_RECURRENCE_ANNOTATION);
  return match ? { firstDate: match[1], kind: match[2] } : null;
}

function stripRecurrenceAnnotations(value: string): string {
  return value.replace(new RegExp(TASK_RECURRENCE_ANNOTATION.source, "giu"), "").trim();
}

const object = (value: unknown): value is UnknownItem =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const items = (value: unknown): UnknownItem[] =>
  Array.isArray(value) ? value.filter(object) : [];

const normalized = (value: string): string =>
  value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

const truncateCharacters = (value: string, limit: number): string => {
  const characters = Array.from(value.trim());
  if (characters.length <= limit) return characters.join("");
  return `${characters.slice(0, Math.max(1, limit - 1)).join("").trimEnd()}…`;
};

export function extractFirstJsonObject(raw: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (start < 0) {
      if (character !== "{") continue;
      start = index;
      depth = 1;
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, index + 1);
    }
  }

  return null;
}

export function completionHitOutputLimit(
  result: StructuredCompletionSignals,
  nPredict: number,
): boolean {
  if (result.truncated || result.context_full) return true;
  if (typeof result.stopped_limit === "number" && result.stopped_limit > 0) return true;
  return (
    typeof result.tokens_predicted === "number" &&
    result.tokens_predicted >= nPredict &&
    result.stopped_eos !== true
  );
}

function segmentClauses(value: string): string[] {
  const text = value
    .replace(/\r\n?/gu, "\n")
    .replace(/\s*,?\s+(?:but|however|yet)\s+/giu, "; ")
    .replace(
      /\s+and\s+(?=(?:(?:i|we)\s+(?:need(?:\s+to)?|must|will|should|have\s+to)\b|(?:please\s+)?remind\s+(?:me|us)\b))/giu,
      "; ",
    )
    .replace(/[，,]\s*(?:但是|但|不过|不過|然而)\s*/gu, "；")
    .replace(/(^|[^不])但(?:是)?\s*/gu, "$1；")
    .replace(/(?:不过|不過|然而|然后|然後)\s*/gu, "；")
    .trim();
  if (!text) return [];
  return (
    text.match(/[^.!?。！？;；\n]+(?:[.!?。！？;；]+|$)/gu) ?? [text]
  ).map((part) => part.trim()).filter(Boolean);
}

function splitOversizedClause(value: string, maxCharacters: number): string[] {
  if (Array.from(value).length <= maxCharacters) return [value.trim()];
  const words = value.trim().split(/\s+/u);
  if (words.length > 1) {
    const parts: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (Array.from(candidate).length > maxCharacters && current) {
        parts.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) parts.push(current);
    if (parts.length > 1) return parts;
  }

  const characters = Array.from(value.trim());
  const parts: string[] = [];
  for (let start = 0; start < characters.length; start += maxCharacters) {
    parts.push(characters.slice(start, start + maxCharacters).join("").trim());
  }
  return parts.filter(Boolean);
}

function intentClauses(value: string): string[] {
  return segmentClauses(value).flatMap((clause) =>
    splitOversizedClause(clause, MAX_INTENT_CHARS_PER_CHUNK),
  );
}

export function splitIntentTranscript(value: string): string[] {
  const clauses = intentClauses(value);
  if (!clauses.length) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentCharacters = 0;
  for (const clause of clauses) {
    const clauseCharacters = Array.from(clause).length;
    const separatorCharacters = current.length ? 1 : 0;
    const wouldOverflow =
      current.length >= MAX_INTENT_CLAUSES_PER_CHUNK ||
      currentCharacters + separatorCharacters + clauseCharacters > MAX_INTENT_CHARS_PER_CHUNK;
    if (wouldOverflow && current.length) {
      chunks.push(current.join(" "));
      current = [];
      currentCharacters = 0;
    }
    current.push(clause);
    currentCharacters += (current.length > 1 ? 1 : 0) + clauseCharacters;
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

function bisectIntentInput(value: string): string[] {
  const clauses = intentClauses(value);
  if (clauses.length > 1) {
    const middle = Math.ceil(clauses.length / 2);
    return [clauses.slice(0, middle).join(" "), clauses.slice(middle).join(" ")]
      .map((part) => part.trim())
      .filter(Boolean);
  }

  const characters = Array.from(value.trim());
  if (characters.length <= MIN_RECOVERY_SPLIT_CHARACTERS) return [value.trim()].filter(Boolean);
  const middle = Math.floor(characters.length / 2);
  const searchStart = Math.max(1, middle - Math.floor(characters.length / 4));
  const searchEnd = Math.min(characters.length - 1, middle + Math.floor(characters.length / 4));
  let splitAt = -1;
  for (let distance = 0; distance <= searchEnd - searchStart; distance += 1) {
    for (const candidate of [middle - distance, middle + distance]) {
      if (candidate < searchStart || candidate > searchEnd) continue;
      if (/\s|[,，:：]/u.test(characters[candidate] ?? "")) {
        splitAt = candidate + 1;
        break;
      }
    }
    if (splitAt > 0) break;
  }
  if (splitAt < 1 || splitAt >= characters.length) return [value.trim()];
  return [characters.slice(0, splitAt).join(""), characters.slice(splitAt).join("")]
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function runAdaptiveStructuredBatches<T>(options: {
  inputs: string[];
  complete: (input: string, mode: AdaptiveCompletionMode) => Promise<StructuredStageResult>;
  parse: (raw: string) => T;
}): Promise<AdaptiveBatchResult<T>> {
  const values: AdaptiveBatchResult<T>["values"] = [];
  const failures: AdaptiveBatchResult<T>["failures"] = [];

  const run = async (input: string, depth: number): Promise<void> => {
    const normal = await options.complete(input, "normal");
    let normalInvalid = false;
    if (!normal.hitOutputLimit) {
      try {
        values.push({ input, value: options.parse(normal.raw) });
        return;
      } catch {
        normalInvalid = true;
      }
    }

    if (normalInvalid) {
      const expanded = await options.complete(input, "expanded");
      if (!expanded.hitOutputLimit) {
        try {
          values.push({ input, value: options.parse(expanded.raw) });
          return;
        } catch {
          // Split below. A smaller evidence window is the final structured retry.
        }
      }
    }

    const parts = depth < MAX_RECOVERY_DEPTH ? bisectIntentInput(input) : [input];
    if (parts.length > 1 && parts.every((part) => part !== input)) {
      for (const part of parts) await run(part, depth + 1);
      return;
    }

    if (!normalInvalid) {
      const expanded = await options.complete(input, "expanded");
      if (!expanded.hitOutputLimit) {
        try {
          values.push({ input, value: options.parse(expanded.raw) });
          return;
        } catch {
          failures.push({ input, reason: "invalid-json" });
          return;
        }
      }
    }
    failures.push({ input, reason: normal.hitOutputLimit ? "output-limit" : "invalid-json" });
  };

  for (const input of options.inputs.map((part) => part.trim()).filter(Boolean)) {
    await run(input, 0);
  }
  return { values, failures };
}

function searchableTokens(value: string): string[] {
  return Array.from(
    new Set(
      (value.toLocaleLowerCase().match(/[a-z0-9]+|\p{Script=Han}/gu) ?? [])
        .filter((token) => token.length >= 3 || /\p{Script=Han}/u.test(token)),
    ),
  );
}

function supportingClause(item: UnknownItem, transcript: string): string {
  const clauses = segmentClauses(transcript);
  if (!clauses.length) return "";
  const evidence = [
    item.title,
    item.description,
    item.startsAtExpression,
    item.dueAtExpression,
    item.endsAtExpression,
    item.remindAtExpression,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const tokens = searchableTokens(evidence.join(" "));
  let best = "";
  let bestScore = 0;
  for (const clause of clauses) {
    const normalizedClause = normalized(clause);
    const tokenScore = tokens.reduce(
      (score, token) => score + (normalizedClause.includes(normalized(token)) ? 1 : 0),
      0,
    );
    const exactScore = evidence.reduce(
      (score, value) => score + (normalizedClause.includes(normalized(value)) ? 4 : 0),
      0,
    );
    const score = tokenScore + exactScore;
    if (score > bestScore) {
      best = clause;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : "";
}

const COMPLETED_FACT_EN = /\b(?:planned|reviewed|designed|prepared|tested|checked|verified|measured|finished|completed|submitted|delivered|created|updated|fixed|implemented|built|contacted|confirmed)\b/iu;
const COMPLETED_FACT_ZH = /(?:已经|已經|已|完成了|测试了|測試了|检查了|檢查了|审核了|審核了|准备了|準備了|设计了|設計了|开发了|開發了|提交了|验证了|驗證了|测量了|測量了)/u;
const TASK_EN = /\b(?:must|needs?\s+to|has\s+to|have\s+to|should|shall|responsible\s+for|assigned\s+to|please|to-?do|action\s+item|due\s+(?:by|on)|deadline|will\s+(?:attend|join|present|report|renew|finish|complete|prepare|submit|deliver|review|test|check|send|call|email|write|create|update|fix|implement|build|contact|confirm|bring|take|pay|study|practice|record))\b/iu;
const TASK_ZH = /(?:必须|必須|需要|需在|应该|應該|应当|應當|负责|負責|请|請|务必|務必|待办|待辦|任务|任務|截止|前完成|要在|将负责|將負責)/u;
const FUTURE_TASK_ZH = /(?:我们(?!的)|我們(?!的)|我(?![们們的])|本人).{0,16}?(?:将|將|会|會).{0,40}?(?:参加|參加|提交|发送|發送|完成|准备|準備|检查|檢查|联系|聯繫|续保|續保|续费|續費)/gu;
const PLANNED_TASK_EN = /\b(?:(?:i|we)\s+plan\s+to|i\s+am\s+going\s+to|we\s+are\s+going\s+to)\s+(?:attend|join|present|report|renew|submit|send|finish|complete|prepare|deliver|review|test|check|call|email|write|create|update|fix|implement|build|contact|confirm|bring|take|pay|study|practice|record)\b/iu;
const PLANNED_TASK_ZH = /(?:我们(?!的)|我們(?!的)|我(?![们們的])|本人)\s*(?:要(?!是)|打算|计划|計劃).{0,32}?(?:参加|參加|提交|发送|發送|完成|准备|準備|检查|檢查|联系|聯繫|续保|續保|续费|續費)/gu;
const NEGATED_FUTURE_TASK_ZH = /(?:不会|不會|不打算|(?:将|將)\s*不)/u;
const CONDITIONAL_FUTURE_EN = /\b(?:if|unless|provided\s+that|assuming\s+that)\b/iu;
const CONDITIONAL_FUTURE_ZH = /(?:如果|假如|假設|假设|要是|若(?:是|果)?|取决于|取決於)/u;
const AUTOMATED_SYSTEM_FUTURE_ZH = /(?:系统|系統|软件|軟件|应用|應用|服务|服務|程序|平台).{0,12}(?:将|將|会|會).{0,12}(?:自动|自動)/u;
const EXPLANATORY_FUTURE_ZH = /(?:讨论如何|討論如何|说明如何|說明如何|介绍如何|介紹如何)/u;
const UNFINISHED_TASK_EN = /\b(?:still\s+(?:needs?|waiting)|not\s+yet|hasn['’]?t|haven['’]?t|overdue|left\s+(?:pending|unfinished))\b/iu;
const UNFINISHED_TASK_ZH = /(?:拖了(?:[一二两兩三四五六七八九十\d]+)?(?:天|周|週|个月|個月|月)?|还等着|還等著|还没|還沒|尚未|仍未|(?:^|[，,；;\s])得(?:找|联系|聯繫|问|問|处理|處理|完成|提交|发送|發送|续|續)|争取|爭取|尽量|儘量|尽快|儘快|抽空|有空(?:的话|的話)?)/u;
const RECURRING_TASK_ACTION_EN = /\b(?:send|review|check|prepare|submit|deliver|test|call|write|create|update|fix|implement|build|contact|confirm|publish|report|backup|sync|clean|pay|exercise|study|practice|record|inspect|monitor)\b/iu;
const RECURRING_TASK_ACTION_ZH = /(?:发送|發送|复习|複習|覆核|审核|審核|检查|檢查|准备|準備|提交|交付|测试|測試|打电话|打電話|致电|致電|编写|編寫|写|寫|创建|創建|更新|修复|修復|实现|實現|构建|構建|联系|聯繫|确认|確認|发布|發布|汇报|彙報|备份|備份|同步|清理|支付|锻炼|鍛煉|学习|學習|练习|練習|记录|記錄|巡检|巡檢|监控|監控|参加|參加)/u;
const REMINDER_WORDING_EN = /\b(?:remind(?:er|\s+me|\s+us)?|remember\s+to|notify|alert)\b/iu;
const REMINDER_WORDING_ZH = /(?:提醒|记得|記得|通知|闹钟|鬧鐘)/u;
const REMINDER_TASK_ACTION_EN = /\b(?:attend|join|present|report|renew|submit|send|finish|complete|prepare|deliver|review|test|check|call|email|write|create|update|fix|implement|build|contact|confirm|bring|take|pay|study|practice|record)\b/iu;
const REMINDER_TASK_ACTION_ZH = /(?:参加|參加|汇报|彙報|報告|续保|續保|续费|續費|提交|发送|發送|完成|准备|準備|交付|复习|複習|审核|審核|检查|檢查|测试|測試|打电话|打電話|致电|致電|联系|聯繫|确认|確認|携带|攜帶|支付|学习|學習|练习|練習|记录|記錄)/u;
const INTERNAL_DATE_ANNOTATION = /\(\d{4}-\d{2}-\d{2}(?:,\s*REPEAT=(?:daily|weekdays|weekly|biweekly|monthly))?\)/giu;
const REMINDER_DATE_ZH = /(?:(?:\d{4}|[〇零一二三四五六七八九]{4})\s*年\s*)?(?:\d{1,2}|[一二两兩三四五六七八九十]{1,3})\s*月\s*(?:\d{1,2}|[一二两兩三四五六七八九十]{1,3})\s*[日号號]/gu;
const REMINDER_RELATIVE_DATE_ZH = /(?:今天|今日|明天|明日|后天|後天|大后天|大後天|下(?:个|個)?月|本月|这个月|這個月|月底|月末|(?:下下|下个|下個|下|这个|這個|本|这|這)?(?:周|週|星期|礼拜|禮拜)[一二三四五六日天1-7])/gu;
const REMINDER_CLOCK_ZH = /(?:上午|早上|中午|下午|晚上)?\s*(?:\d{1,2}|[一二两兩三四五六七八九十]+)\s*[点點时時](?:\s*\d{1,2}\s*分)?/gu;
const REMINDER_LEAD_ZH = /(?:提前|提早)\s*(?:\d+|[一二两兩三四五六七八九十]{1,3})\s*(?:个|個)?\s*(?:天|日|周|週|星期|礼拜|禮拜)/gu;
const REMINDER_REQUEST_ZH = /(?:(?:请|請|麻烦|麻煩)\s*)?(?:提醒|通知)\s*(?:我|我们|我們)?|(?:记得|記得)|(?:(?:设置|設置|创建|創建|安排)\s*)?(?:闹钟|鬧鐘)/gu;
const REMINDER_FILLER_ZH = /(?:请|請|麻烦|麻煩|谢谢|謝謝|多谢|多謝|我们|我們|我|你|有\s*(?:一\s*)?[场場个個]?|一\s*[场場个個]|设置|設置|创建|創建|安排|要\s*去|要|在|于|於|一下|届时|屆時|的)/gu;
const REMINDER_DATE_EN = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:,?\s+\d{4})?\b/giu;
const REMINDER_RELATIVE_DATE_EN = /\b(?:today|tomorrow|tonight|the\s+day\s+after\s+tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+month)\b|\b(?:in\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:days?|weeks?)\s*(?:before|earlier|from\s+now|later)?\b/giu;
const REMINDER_CLOCK_EN = /\b(?:1[0-2]|0?\d)(?::[0-5]\d)?\s*(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/giu;
const REMINDER_REQUEST_EN = /\b(?:remind|notify|alert)\s+(?:me|us)\b|\bremember\s+to\b|\b(?:set|create|schedule)\s+(?:a\s+)?(?:reminder|notification|alert)\b/giu;
const REMINDER_FILLER_EN = new Set(["a", "about", "alert", "an", "at", "create", "for", "have", "has", "i", "in", "is", "me", "my", "notification", "on", "our", "please", "reminder", "schedule", "set", "the", "there", "to", "us", "we", "will", "you"]);
const CLOCK_EN = /\b(?:1[0-2]|0?\d)(?::[0-5]\d)?\s*(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/iu;
const CLOCK_ZH = /(?:上午|早上|中午|下午|晚上)?\s*(?:\d{1,2}|[一二三四五六七八九十]+)\s*[点點时時]/u;
const NEGATED_INTENT_EN = /\b(?:no\s+(?:task|action)|not\s+(?:required|needed)|(?:(?:do|does)\s+not|(?:don|doesn)['’]?t)\s+(?:need\s+to|have\s+to)|(?:there(?:['’]s|\s+is)\s+)?no\s+need\s+to|need\s+not|(?:do\s+not|don['’]?t)\s+(?:submit|send|finish|complete|prepare|call|email|review))\b/iu;
const NEGATED_INTENT_ZH = /(?:无需|不需要|不要|没有)(?:.{0,8})(?:任务|待办|行动)|(?:任务|待办)(?:已)?取消|(?:不需要|无需|不用|不必).{0,20}(?:参加|參加|提交|发送|發送|完成|准备|準備|检查|檢查|联系|聯繫|续保|續保|续费|續費)/u;
const NEGATED_REMINDER_EN = /\b(?:(?:(?:do|does|did)\s+not|(?:don|doesn|didn)['’]?t|never)\s+(?:remind|notify|alert|remember\s+to)|no\s+(?:reminder|notification|alert)|cancel(?:led)?\s+(?:the\s+)?(?:reminder|notification|alert))\b/iu;
const NEGATED_REMINDER_ZH = /(?:不要|不需要|无需|不用|取消|不再|别|別|没有|沒有)(?:.{0,8})(?:提醒|通知|闹钟|鬧鐘)/u;
const ADVISORY_INTENT_EN = /\b(?:i(?:'d|\s+would)\s+recommend|we\s+recommend|recommend(?:ed|ing)?|suggest(?:ed|ing)?|consider|might\s+want\s+to|could\s+try|it\s+(?:may|might)\s+help\s+to)\b/iu;
const ADVISORY_INTENT_ZH = /(?:我(?:会|會)?(?:建议|建議)|(?:建议|建議)(?:可以|先|从|從)?|(?:推荐|推薦)(?:可以|先|从|從)?|不妨|可以考虑|可以考慮|最好考虑|最好考慮)/u;

function completedFact(clause: string): boolean {
  return COMPLETED_FACT_EN.test(clause) || COMPLETED_FACT_ZH.test(clause);
}

function hasTaskEvidence(clause: string): boolean {
  if (!clause) return false;
  const reminderWording = REMINDER_WORDING_EN.test(clause) || REMINDER_WORDING_ZH.test(clause);
  if (reminderWording) {
    if (hasExplicitReminderRequest(clause)) return hasReminderTaskEvidence(clause, true);
    if (completedFact(clause)) return false;
    return hasReminderTaskEvidence(clause);
  }
  const explicitObligation = TASK_EN.test(clause) || TASK_ZH.test(clause) ||
    hasFutureChineseCommitment(clause) || hasPlannedTaskEvidence(clause);
  if (explicitObligation) return true;
  if (completedFact(clause)) return false;
  return UNFINISHED_TASK_EN.test(clause) || UNFINISHED_TASK_ZH.test(clause);
}

function hasFutureChineseCommitment(clause: string): boolean {
  if (CONDITIONAL_FUTURE_ZH.test(clause)) return false;
  for (const match of clause.matchAll(FUTURE_TASK_ZH)) {
    const matchedCommitment = match[0];
    if (NEGATED_FUTURE_TASK_ZH.test(matchedCommitment)) continue;
    if (AUTOMATED_SYSTEM_FUTURE_ZH.test(matchedCommitment)) continue;
    if (EXPLANATORY_FUTURE_ZH.test(matchedCommitment)) continue;

    return true;
  }
  return false;
}

function hasPlannedTaskEvidence(clause: string): boolean {
  if (!CONDITIONAL_FUTURE_EN.test(clause) && PLANNED_TASK_EN.test(clause)) return true;
  if (CONDITIONAL_FUTURE_ZH.test(clause)) return false;
  for (const match of clause.matchAll(PLANNED_TASK_ZH)) {
    if (!EXPLANATORY_FUTURE_ZH.test(match[0])) return true;
  }
  return false;
}

function hasExplicitReminderRequest(clause: string): boolean {
  if (/\b(?:(?:remind|notify|alert)\s+(?:me|us)|remember\s+to)\b/iu.test(clause)) return true;
  for (const match of clause.matchAll(/(?:(?:提醒|通知)我|(?:请|請)(?:提醒|通知)|记得|記得)/gu)) {
    if (!COMPLETED_FACT_ZH.test(clausePrefixBefore(clause, match.index))) return true;
  }
  return false;
}

function clausePrefixBefore(clause: string, index: number): string {
  const previousBoundary = Math.max(
    clause.lastIndexOf("。", index - 1),
    clause.lastIndexOf("！", index - 1),
    clause.lastIndexOf("？", index - 1),
    clause.lastIndexOf(";", index - 1),
    clause.lastIndexOf("；", index - 1),
  );
  return clause.slice(previousBoundary + 1, index);
}

function hasReminderTaskEvidence(clause: string, allowConcreteSubject = false): boolean {
  return REMINDER_TASK_ACTION_EN.test(clause) || REMINDER_TASK_ACTION_ZH.test(clause) ||
    (allowConcreteSubject && hasConcreteReminderSubject(clause));
}

function hasConcreteReminderSubject(clause: string): boolean {
  const withoutSchedule = clause
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(INTERNAL_DATE_ANNOTATION, " ")
    .replace(REMINDER_DATE_ZH, " ")
    .replace(REMINDER_RELATIVE_DATE_ZH, " ")
    .replace(REMINDER_CLOCK_ZH, " ")
    .replace(REMINDER_LEAD_ZH, " ")
    .replace(REMINDER_REQUEST_ZH, " ")
    .replace(REMINDER_FILLER_ZH, " ")
    .replace(REMINDER_DATE_EN, " ")
    .replace(REMINDER_RELATIVE_DATE_EN, " ")
    .replace(REMINDER_CLOCK_EN, " ")
    .replace(REMINDER_REQUEST_EN, " ");
  const chineseContent = withoutSchedule.match(/\p{Script=Han}/gu) ?? [];
  if (chineseContent.length >= 2) return true;

  return (withoutSchedule.match(/[a-z]{2,}/gu) ?? [])
    .some((word) => !REMINDER_FILLER_EN.has(word));
}

function hasRecurringTaskEvidence(clause: string): boolean {
  return Boolean(clause) &&
    !completedFact(clause) &&
    recurrenceEvidence(clause) !== null &&
    (RECURRING_TASK_ACTION_EN.test(clause) || RECURRING_TASK_ACTION_ZH.test(clause)) &&
    (!(REMINDER_WORDING_EN.test(clause) || REMINDER_WORDING_ZH.test(clause)) ||
      hasReminderTaskEvidence(clause, hasExplicitReminderRequest(clause)));
}

function isNegatedIntent(clause: string): boolean {
  return NEGATED_INTENT_EN.test(clause) || NEGATED_INTENT_ZH.test(clause) ||
    NEGATED_REMINDER_EN.test(clause) || NEGATED_REMINDER_ZH.test(clause);
}

function isAdvisoryIntent(clause: string): boolean {
  return ADVISORY_INTENT_EN.test(clause) || ADVISORY_INTENT_ZH.test(clause);
}

function cleanEvidenceTitle(clause: string): string {
  return truncateCharacters(stripRecurrenceAnnotations(clause).replace(/[.!?。！？;；]+$/u, "").trim(), 240);
}

function explicitEvidenceCategory(
  clause: string,
): keyof SanitizedIntentOutput | null {
  if (!clause || isNegatedIntent(clause) || isAdvisoryIntent(clause)) return null;
  if (hasTaskEvidence(clause) || hasRecurringTaskEvidence(clause)) return "tasks";
  return null;
}

function deterministicIntentItem(
  clause: string,
): UnknownItem {
  const title = cleanEvidenceTitle(clause);
  const recurrence = recurrenceEvidence(clause);
  return {
    title,
    description: null,
    startsAtExpression: null,
    dueAtExpression: recurrence ? recurrenceDueExpression(clause, recurrence) : extractCoreNoteTimeExpression(clause),
    recurrence: recurrence?.kind ?? null,
    actionItems: [],
  };
}

function recurrenceDueExpression(clause: string, recurrence: { firstDate: string; kind: string }): string {
  const clock = clause.match(CLOCK_EN)?.[0] ?? clause.match(CLOCK_ZH)?.[0] ?? null;
  return clock ? `${recurrence.firstDate} ${clock}` : recurrence.firstDate;
}

function addMissingExplicitEvidence(
  output: SanitizedIntentOutput,
  transcript: string,
): SanitizedIntentOutput {
  const represented = {
    tasks: new Set(output.tasks.map((item) => normalized(supportingClause(item, transcript))).filter(Boolean)),
  };
  for (const clause of segmentClauses(transcript)) {
    const category = explicitEvidenceCategory(clause);
    if (!category) continue;
    const identity = normalized(clause);
    if (represented[category].has(identity)) continue;
    output[category].push(deterministicIntentItem(clause));
    represented[category].add(identity);
  }
  return output;
}

function groundedExpression(value: unknown, clause: string): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  if (!normalized(clause).includes(normalized(value))) return null;
  return extractCoreNoteTimeExpression(value);
}

function groundedItem(item: UnknownItem, clause: string): UnknownItem {
  return {
    ...item,
    startsAtExpression: groundedExpression(item.startsAtExpression, clause),
    dueAtExpression: groundedExpression(item.dueAtExpression, clause),
  };
}

export function sanitizeIntentOutput(value: unknown, transcript: string): SanitizedIntentOutput {
  const output = object(value) ? value : {};
  const tasks = items(output.tasks).flatMap((item) => {
    const clause = supportingClause(item, transcript);
    const recurrence = recurrenceEvidence(clause);
    if ((!hasTaskEvidence(clause) && !recurrence) || isNegatedIntent(clause) || isAdvisoryIntent(clause)) return [];
    const actionItems = items(item.actionItems).flatMap((action) => {
      const actionClause = supportingClause(action, transcript);
      return hasTaskEvidence(actionClause) && !isNegatedIntent(actionClause) && !isAdvisoryIntent(actionClause)
        ? [groundedItem(action, actionClause)]
        : [];
    });
    const grounded = groundedItem(item, clause);
    const recoveredDueExpression = grounded.dueAtExpression ?? (
      grounded.startsAtExpression === null
        ? extractCoreNoteTimeExpression(clause)
        : null
    );
    return [{
      ...grounded,
      dueAtExpression: recurrence ? recurrenceDueExpression(clause, recurrence) : recoveredDueExpression,
      recurrence: recurrence?.kind ?? null,
      actionItems,
    }];
  });
  return addMissingExplicitEvidence({ tasks }, transcript);
}

function itemIdentity(item: UnknownItem): string {
  return [
    item.title,
    item.startsAtExpression,
    item.dueAtExpression,
  ].map((value) => normalized(typeof value === "string" ? value : "")).join("|");
}

function uniqueItems(values: UnknownItem[]): UnknownItem[] {
  const seen = new Set<string>();
  return values.filter((item) => {
    const identity = itemIdentity(item);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function mergeIntentOutputs(values: SanitizedIntentOutput[]): SanitizedIntentOutput {
  return {
    tasks: uniqueItems(values.flatMap((value) => value.tasks)),
  };
}

export function sanitizeAdaptiveIntentBatches(
  batches: AdaptiveBatchResult<unknown>,
): SanitizedIntentOutput {
  return mergeIntentOutputs([
    ...batches.values.map(({ input, value }) => sanitizeIntentOutput(value, input)),
    ...batches.failures.map(({ input }) => sanitizeIntentOutput({}, input)),
  ]);
}

export function fallbackContentFromTranscript(transcript: string): {
  summary: string;
  keyPoints: string[];
} {
  const compact = transcript.replace(/\s+/gu, " ").trim();
  const clauses = segmentClauses(transcript);
  return {
    summary: truncateCharacters(compact, MAX_FALLBACK_SUMMARY_CHARS),
    keyPoints: clauses
      .slice(0, MAX_FALLBACK_KEY_POINTS)
      .map((clause) => truncateCharacters(clause, MAX_FALLBACK_KEY_POINT_CHARS))
      .filter(Boolean),
  };
}
