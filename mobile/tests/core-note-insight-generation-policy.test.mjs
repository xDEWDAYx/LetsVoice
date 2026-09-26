import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  completionHitOutputLimit,
  extractFirstJsonObject,
  fallbackContentFromTranscript,
  mergeIntentOutputs,
  runAdaptiveStructuredBatches,
  sanitizeAdaptiveIntentBatches,
  sanitizeIntentOutput,
  splitIntentTranscript,
} from "../src/services/core-note-insight-generation-policy.ts";
import { extractCoreNoteTimeExpression, resolveCoreNoteTime } from "../src/services/core-note-time.ts";
import { annotateTaskRecurrences } from "../src/services/task-recurrence.ts";

const emptyIntents = () => ({ tasks: [] });
const parseExtractedJson = (raw) => {
  const json = extractFirstJsonObject(raw);
  if (!json) throw new Error("No complete JSON object");
  return JSON.parse(json);
};

test("complete JSON is extracted through chat-template noise without accepting truncated JSON", () => {
  const complete = '<|im_start|>assistant\n{"summary":"A brace: } and quote: \\\"","keyPoints":[]}\n<|im_end|>';
  assert.equal(
    extractFirstJsonObject(complete),
    '{"summary":"A brace: } and quote: \\\"","keyPoints":[]}',
  );
  assert.equal(
    extractFirstJsonObject('<|im_start|>assistant\n{"tasks":[{"title":"On 10'),
    null,
  );
});

test("native completion stop metadata detects every output-limit signal", () => {
  assert.equal(completionHitOutputLimit({ stopped_limit: 1 }, 1152), true);
  assert.equal(completionHitOutputLimit({ truncated: true }, 1152), true);
  assert.equal(completionHitOutputLimit({ context_full: true }, 1152), true);
  assert.equal(
    completionHitOutputLimit({ tokens_predicted: 1152, stopped_eos: false }, 1152),
    true,
  );
  assert.equal(
    completionHitOutputLimit({ tokens_predicted: 221, stopped_eos: true }, 1152),
    false,
  );
});

test("dense intent evidence is proactively split without losing any dated clause", () => {
  const dense = Array.from(
    { length: 16 },
    (_, index) => `On ${index + 1} September 2026, Person ${index + 1} reviewed item ${index + 1}.`,
  ).join(" ");
  const chunks = splitIntentTranscript(dense);

  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((chunk) => (chunk.match(/September 2026/gu) ?? []).length <= 6));
  for (let day = 1; day <= 16; day += 1) {
    assert.ok(chunks.some((chunk) => chunk.includes(`On ${day} September 2026`)));
  }
});

test("adaptive batches split token-limited output and retry malformed minimal output", async () => {
  const calls = [];
  const result = await runAdaptiveStructuredBatches({
    inputs: ["First clause. Second clause."],
    complete: async (input, mode) => {
      calls.push([input, mode]);
      if (input === "First clause. Second clause.") {
        return { raw: '{"tasks":[', hitOutputLimit: true };
      }
      if (input === "First clause." && mode === "normal") {
        return { raw: "not-json", hitOutputLimit: false };
      }
      return {
        raw: `<|im_start|>assistant\n${JSON.stringify({ ...emptyIntents(), tasks: [{ title: input }] })}`,
        hitOutputLimit: false,
      };
    },
    parse: parseExtractedJson,
  });

  assert.deepEqual(result.failures, []);
  assert.deepEqual(
    result.values.map(({ value }) => value.tasks[0].title),
    ["First clause.", "Second clause."],
  );
  assert.ok(calls.some(([input, mode]) => input === "First clause." && mode === "expanded"));
});

test("an unrecoverable minimal batch is isolated instead of failing the whole insight", async () => {
  const result = await runAdaptiveStructuredBatches({
    inputs: ["One malformed clause."],
    complete: async () => ({ raw: '{"tasks":[', hitOutputLimit: true }),
    parse: parseExtractedJson,
  });

  assert.deepEqual(result.values, []);
  assert.deepEqual(result.failures, [
    { input: "One malformed clause.", reason: "output-limit" },
  ]);
});

test("explicit evidence still survives when its minimal model batch never returns JSON", () => {
  const recovered = sanitizeAdaptiveIntentBatches({
    values: [],
    failures: [{
      input: "Leo must submit the final report by 28 August 2026.",
      reason: "output-limit",
    }],
  });

  assert.equal(recovered.tasks.length, 1);
  assert.match(recovered.tasks[0].title, /Leo/u);
});

test("completed dated facts are not promoted to tasks", () => {
  const transcript = [
    "On 1 September 2026, Alice planned the research.",
    "On 2 September 2026, Bob reviewed the requirements.",
    "On 3 September 2026, Carol designed the interface.",
    "On 4 September 2026, David prepared the database.",
  ].join(" ");
  const modelOutput = {
    tasks: [
      { title: "Alice planned the research", dueAtExpression: "On 1 September 2026" },
      { title: "Bob reviewed the requirements", dueAtExpression: "On 2 September 2026" },
      { title: "Carol designed the interface", dueAtExpression: "On 3 September 2026" },
      { title: "David prepared the database", dueAtExpression: "On 4 September 2026" },
    ],
  };

  assert.deepEqual(sanitizeIntentOutput(modelOutput, transcript), emptyIntents());
});

test("completed words inside task objects do not suppress explicit obligations", () => {
  const obligations = [
    "I must submit the prepared report tomorrow.",
    "I need to send the completed form on Friday.",
    "我需要明天提交已修改的报告。",
    "我必须周五发送已经完成的表格。",
  ];
  for (const transcript of obligations) {
    assert.equal(sanitizeIntentOutput(emptyIntents(), transcript).tasks.length, 1, transcript);
  }

  const completedFacts = [
    "I submitted the prepared report yesterday.",
    "我已经提交已修改的报告。",
    "I completed the reminder about submitting the prepared report yesterday.",
    "我已经提醒同事提交了报告。",
  ];
  for (const transcript of completedFacts) {
    assert.deepEqual(sanitizeIntentOutput(emptyIntents(), transcript), emptyIntents(), transcript);
  }
});

test("explicit first-person plans survive while wishes and conditions remain excluded", () => {
  const plans = [
    "我要明天提交报告。",
    "我打算明天提交报告。",
    "I plan to submit the report tomorrow.",
    "I am going to submit the report tomorrow.",
  ];
  for (const transcript of plans) {
    assert.equal(sanitizeIntentOutput(emptyIntents(), transcript).tasks.length, 1, transcript);
  }

  const nonPlans = [
    "I wish I could submit the report tomorrow.",
    "If I have time, I plan to submit the report tomorrow.",
    "I plan to submit the report tomorrow if I have time.",
    "我希望明天可以提交报告。",
    "如果有时间，我打算明天提交报告。",
    "我打算明天提交报告，如果有时间。",
    "我要是有时间就提交报告。",
  ];
  for (const transcript of nonPlans) {
    assert.deepEqual(sanitizeIntentOutput(emptyIntents(), transcript), emptyIntents(), transcript);
  }

  assert.equal(
    sanitizeIntentOutput(emptyIntents(), "Remind me to submit the completed form tomorrow.").tasks.length,
    1,
  );
});

test("explicit tasks remain while retired entities are ignored and reminder actions become tasks", () => {
  const english = [
    "Leo Wong must finish the offline-search benchmark by 28 August 2026.",
    "The team will meet in Lab 3 at 14:30 on 26 August 2026.",
    "Maya asked for a reminder at 13:45 on the same day.",
  ].join(" ");
  const englishOutput = {
    tasks: [{ title: "Leo Wong must finish the offline-search benchmark", dueAtExpression: "28 August 2026", actionItems: [] }],
    reminders: [{ title: "Remind Maya", description: "Maya asked for a reminder", remindAtExpression: "13:45 on the same day" }],
    calendarIntents: [{ title: "Team meeting", description: "The team will meet in Lab 3", startsAtExpression: "14:30 on 26 August 2026" }],
  };
  const keptEnglish = sanitizeIntentOutput(englishOutput, english);
  assert.equal(keptEnglish.tasks.length, 1);
  assert.deepEqual(Object.keys(keptEnglish), ["tasks"]);

  const chinese = "启航小组将在 2026 年 8 月 30 日下午 3 点于图书馆二楼进行毕业设计演示。林悦负责 iOS 客户端演示，周凯需要在 8 月 27 日前完成离线搜索测试。请在演示开始前一小时提醒林悦检查投影设备。";
  const chineseOutput = {
    tasks: [{ title: "周凯完成离线搜索测试", dueAtExpression: "8 月 27 日前", actionItems: [] }],
    reminders: [{ title: "提醒林悦检查投影设备", remindAtExpression: "演示开始前一小时" }],
    calendarIntents: [{ title: "毕业设计演示", startsAtExpression: "2026 年 8 月 30 日下午 3 点" }],
  };
  const keptChinese = sanitizeIntentOutput(chineseOutput, chinese);
  assert.equal(keptChinese.tasks.length, 2);
  assert.ok(keptChinese.tasks.some((task) => /检查投影设备/u.test(task.title)));
  assert.deepEqual(Object.keys(keptChinese), ["tasks"]);
});

test("high-confidence explicit tasks are recovered when the small model returns an empty array", () => {
  const transcript = [
    "Leo Wong must finish the offline-search benchmark by 28 August 2026.",
    "The team will meet in Lab 3 at 14:30 on 26 August 2026.",
    "Maya asked for a reminder at 13:45 on the same day.",
  ].join(" ");

  const recovered = sanitizeIntentOutput(emptyIntents(), transcript);
  assert.equal(recovered.tasks.length, 1);
  assert.match(recovered.tasks[0].title, /Leo Wong/u);
  assert.deepEqual(Object.keys(recovered), ["tasks"]);
});

test("explicit recurring actions survive when the small model omits them", () => {
  const reference = new Date("2026-08-24T08:00:00+01:00");
  const transcript = annotateTaskRecurrences(
    "Every Monday at 9 AM send the project status report. Every weekday review bug reports.",
    reference,
  );
  const recovered = sanitizeIntentOutput(emptyIntents(), transcript);

  assert.equal(recovered.tasks.length, 2);
  assert.equal(recovered.tasks[0].recurrence, "weekly");
  assert.match(recovered.tasks[0].dueAtExpression, /^2026-08-31 9 AM$/u);
  assert.match(resolveCoreNoteTime(recovered.tasks[0].dueAtExpression, reference)?.normalized ?? "", /^2026-08-31T09:00:00/u);
  assert.equal(recovered.tasks[1].recurrence, "weekdays");
  assert.equal(recovered.tasks[1].dueAtExpression, "2026-08-24");
});

test("negated intents are not recreated by deterministic coverage", () => {
  const transcript = "No reminder is required. The meeting was cancelled.";
  assert.deepEqual(sanitizeIntentOutput(emptyIntents(), transcript), emptyIntents());
});

test("polluted task time fields are reduced to grounded time phrases", () => {
  const transcript = "Please submit them before next Thursday.";
  const sanitized = sanitizeIntentOutput({
    tasks: [{ title: "Submit them", dueAtExpression: "Please submit them before next Thursday", actionItems: [] }],
  }, transcript);

  assert.equal(sanitized.tasks[0].dueAtExpression, "before next Thursday");
  assert.equal(extractCoreNoteTimeExpression("This has no date"), null);

  const recovered = sanitizeIntentOutput(emptyIntents(), transcript);
  assert.equal(recovered.tasks[0].dueAtExpression, "before next Thursday");
});

test("negated and advisory task clauses are rejected even when the model emits tasks", () => {
  const transcript = [
    "You do not need to memorize these definitions by Friday.",
    "I'd recommend starting the optional reading next Thursday.",
  ].join(" ");
  const modelOutput = {
    ...emptyIntents(),
    tasks: [
      { title: "Memorize these definitions", dueAtExpression: "by Friday", actionItems: [] },
      { title: "Start the optional reading", dueAtExpression: "next Thursday", actionItems: [] },
    ],
  };

  assert.deepEqual(sanitizeIntentOutput(modelOutput, transcript), emptyIntents());
});

test("English date and time evidence in a full grounded clause resolves locally", () => {
  const reference = new Date("2026-08-24T10:00:00+01:00");
  assert.equal(
    resolveCoreNoteTime("Leo must finish by 28 August 2026.", reference)?.normalized,
    "2026-08-28",
  );
  assert.match(
    resolveCoreNoteTime("The team will meet at 14:30 on 26 August 2026.", reference)?.normalized ?? "",
    /^2026-08-26T14:30:00/u,
  );
});

test("yearless Chinese dates resolve against the local reference and accept traditional date characters", () => {
  const reference = new Date("2026-08-26T10:00:00+01:00");

  assert.equal(
    resolveCoreNoteTime("請在 8 月 28 號參加工作面試", reference)?.normalized,
    "2026-08-28",
  );
  assert.equal(
    resolveCoreNoteTime("周凱需要在 8 月 27 日前完成離線搜尋測試", reference)?.normalized,
    "2026-08-27",
  );
  assert.equal(
    resolveCoreNoteTime("8 月 20 日前", reference)?.normalized,
    "2026-08-20",
  );
  assert.equal(
    resolveCoreNoteTime("後天參加工作面試", reference)?.normalized,
    "2026-08-28",
  );
  assert.equal(
    resolveCoreNoteTime("下週五提交報告", reference)?.normalized,
    "2026-09-04",
  );
  assert.equal(
    resolveCoreNoteTime("day after tomorrow", reference)?.normalized,
    "2026-08-28",
  );
});

test("one-off date preprocessing matches the desktop calendar semantics", async () => {
  const { annotateCoreNoteDates } = await import("../src/services/core-note-time.ts");
  const reference = new Date("2026-08-26T12:00:00+01:00");

  const expectations = [
    ["明天提交报告", "明天(2026-08-27)提交报告"],
    ["周三提交报告", "周三(2026-09-02)提交报告"],
    ["周五之前提交报告", "周五(2026-08-28)之前提交报告"],
    ["下周五提交报告", "下周五(2026-09-04)提交报告"],
    ["一周后提交报告", "一周后(2026-09-02)提交报告"],
    ["本周末提交报告", "本周末(2026-08-29)提交报告"],
    ["本月底提交报告", "本月底(2026-08-31)提交报告"],
    ["in 2 weeks submit report", "in 2 weeks(2026-09-09) submit report"],
    ["8月28号提交报告", "8月28号(2026-08-28)提交报告"],
  ];

  for (const [input, expected] of expectations) {
    assert.equal(annotateCoreNoteDates(input, reference), expected, input);
  }
});

test("desktop date preprocessing remains idempotent across boundaries and recurrence", async () => {
  const { annotateCoreNoteDates } = await import("../src/services/core-note-time.ts");
  const reference = new Date("2026-08-26T12:00:00+01:00");
  const yearEnd = new Date("2026-12-31T12:00:00+00:00");
  const cases = [
    ["每周五发周报", "每周五(2026-08-28, REPEAT=weekly)发周报"],
    ["九月十号汇报，提前三天提醒我", "九月十号(2026-09-10)汇报，提前三天(2026-09-07)提醒我"],
    ["9 月 10 号开会，请提前 3 天提醒我", "9 月 10 号(2026-09-10)开会，请提前 3 天(2026-09-07)提醒我"],
    ["二月三十号提交", "二月三十号提交"],
    ["地点在三号楼会议室", "地点在三号楼会议室"],
    ["the day after tomorrow", "the day after tomorrow(2026-08-28)"],
    ["day after tomorrow", "day after tomorrow(2026-08-28)"],
  ];

  for (const [input, expected] of cases) {
    const annotated = annotateCoreNoteDates(input, reference);
    assert.equal(annotated, expected, input);
    assert.equal(annotateCoreNoteDates(annotated, reference), annotated, `${input} should be idempotent`);
  }
  assert.equal(annotateCoreNoteDates("明天", yearEnd), "明天(2027-01-01)");
});

test("date resolution follows desktop weekday semantics and handles the expanded relative range", () => {
  const reference = new Date("2026-08-26T12:00:00+01:00");
  const expectations = [
    ["周三提交报告", "2026-09-02"],
    ["一周后提交报告", "2026-09-02"],
    ["本周末提交报告", "2026-08-29"],
    ["本月底提交报告", "2026-08-31"],
    ["in 2 weeks submit report", "2026-09-09"],
  ];

  for (const [input, expected] of expectations) {
    assert.equal(resolveCoreNoteTime(input, reference)?.normalized, expected, input);
  }
});

test("a multi-date reminder resolves to its actionable reminder date", async () => {
  const { annotateCoreNoteDates } = await import("../src/services/core-note-time.ts");
  const reference = new Date("2026-08-26T12:00:00+01:00");
  const input = "8月28日参加面试，8月27日提醒我准备材料";
  const annotated = annotateCoreNoteDates(input, reference);

  assert.equal(
    annotated,
    "8月28日(2026-08-28)参加面试，8月27日(2026-08-27)提醒我准备材料",
  );
  assert.equal(resolveCoreNoteTime(annotated, reference)?.normalized, "2026-08-27");
});

test("date annotations never leak into generated task titles", async () => {
  const { stripCoreNoteDateAnnotations } = await import("../src/services/core-note-time.ts");

  assert.equal(
    stripCoreNoteDateAnnotations("周五(2026-08-28)提交报告"),
    "周五提交报告",
  );
  assert.equal(
    stripCoreNoteDateAnnotations("每周五(2026-08-28, REPEAT=weekly)提交报告"),
    "每周五提交报告",
  );
  assert.equal(
    stripCoreNoteDateAnnotations("Submit  Friday (2026-08-28) , please"),
    "Submit Friday, please",
  );
});

test("remind wording keeps a concrete dated action as a task without restoring reminder entities", () => {
  const transcript = "提醒我在 8 月 28 號參加工作面試。";
  const recovered = sanitizeIntentOutput(emptyIntents(), transcript);

  assert.equal(recovered.tasks.length, 1);
  assert.match(recovered.tasks[0].title, /參加工作面試/u);
  assert.match(recovered.tasks[0].dueAtExpression ?? "", /8 月 28 號/u);
  assert.deepEqual(Object.keys(recovered), ["tasks"]);

  assert.deepEqual(
    sanitizeIntentOutput(emptyIntents(), "提醒我明天下午三點。"),
    emptyIntents(),
  );
  assert.equal(
    sanitizeIntentOutput(emptyIntents(), "提醒我後天下午三點參加工作面試。").tasks.length,
    1,
  );
  assert.equal(
    sanitizeIntentOutput(emptyIntents(), "Remember to submit the final report.").tasks.length,
    1,
  );
  assert.equal(
    sanitizeIntentOutput(emptyIntents(), "記得提交最終報告。").tasks.length,
    1,
  );
  assert.equal(
    sanitizeIntentOutput(emptyIntents(), "提醒我明天下午三点，谢谢。").tasks.length,
    0,
  );
  assert.equal(
    sanitizeIntentOutput(emptyIntents(), "请设置明天下午三点的闹钟。").tasks.length,
    0,
  );
  assert.equal(
    sanitizeIntentOutput(emptyIntents(), "Set a reminder for tomorrow at 3pm.").tasks.length,
    0,
  );
  assert.equal(
    sanitizeIntentOutput(emptyIntents(), "Remind me about the team meeting tomorrow.").tasks.length,
    1,
  );
});

test("a real iPhone work-meeting reminder survives sanitization and keeps the actionable date", async () => {
  const { annotateCoreNoteDates } = await import("../src/services/core-note-time.ts");
  const reference = new Date("2026-08-27T21:08:29+01:00");
  const transcript = "我9月10號有一場工作會議請你麻煩提前3天 提醒我";
  const annotated = annotateCoreNoteDates(transcript, reference);

  assert.equal(
    annotated,
    "我9月10號(2026-09-10)有一場工作會議請你麻煩提前3天(2026-09-07) 提醒我",
  );

  const candidates = [
    emptyIntents(),
    {
      tasks: [{
        title: "參加工作會議",
        description: null,
        startsAtExpression: null,
        dueAtExpression: "提前3天(2026-09-07) 提醒我",
        recurrence: null,
        actionItems: [],
      }],
    },
  ];

  for (const candidate of candidates) {
    const sanitized = sanitizeIntentOutput(candidate, annotated);
    assert.equal(sanitized.tasks.length, 1, "the explicit meeting reminder must not be discarded");
    assert.equal(
      resolveCoreNoteTime(sanitized.tasks[0].dueAtExpression, reference)?.normalized,
      "2026-09-07",
    );
  }
});

test("desktop-style direct commitments and concrete unfinished obligations survive post-filtering", () => {
  const examples = [
    ["I will attend the interview on August 28th.", "Attend the interview"],
    ["文档拖了两周了。", "完成文档"],
    ["客户还等着报价。", "给客户发送报价"],
    ["保险还没续，得找王姐问问。", "续保险并联系王姐"],
  ];

  for (const [transcript, title] of examples) {
    const output = sanitizeIntentOutput({
      tasks: [{ title, description: null, startsAtExpression: null, dueAtExpression: null, recurrence: null, actionItems: [] }],
    }, transcript);
    assert.equal(output.tasks.length, 1, `expected a grounded task for: ${transcript}`);
  }
});

test("future Chinese commitments and insurance renewal reminders remain tasks", () => {
  const examples = [
    "我將在8月28日參加面試。",
    "我会在系统中提交报告。",
    "我会手动提交报告，系统不会自动发送。",
    "我会参加会议讨论如何提交报告。",
    "提醒我明天续保险。",
    "Remind me to renew the insurance tomorrow.",
  ];
  for (const transcript of examples) {
    assert.equal(sanitizeIntentOutput(emptyIntents(), transcript).tasks.length, 1, transcript);
  }

  const nonCommitments = [
    "我不会参加8月28日的面试。",
    "我將不參加8月28日的面試。",
    "如果有时间，我会参加8月28日的面试。",
    "假如有時間，我會參加8月28日的面試。",
    "系统会自动发送报告。",
    "我确认系统会自动发送报告。",
    "我们的系统会发送报告。",
    "会议将讨论如何提交报告。",
    "我会讨论如何提交报告。",
  ];
  for (const transcript of nonCommitments) {
    assert.deepEqual(sanitizeIntentOutput(emptyIntents(), transcript), emptyIntents(), transcript);
  }
});

test("negated actions and reminders never become tasks", () => {
  const examples = [
    "Do not remind me to submit the report tomorrow.",
    "Don't remind me to submit the report tomorrow.",
    "No reminder to submit the report tomorrow.",
    "Cancel the reminder to submit the report tomorrow.",
    "I do not need to submit the report tomorrow.",
    "She doesn't need to submit the report tomorrow.",
    "She does not need to submit the report tomorrow.",
    "I don't have to submit the report tomorrow.",
    "I do not have to submit the report tomorrow.",
    "There is no need to submit the report tomorrow.",
    "Don't notify me to submit the report tomorrow.",
    "Do not alert me to submit the report tomorrow.",
    "The alert didn't notify me to submit the report tomorrow.",
    "不要提醒我明天提交报告。",
    "不要通知我明天提交报告。",
    "明天不再通知我提交报告。",
    "没有提醒我明天提交报告。",
    "闹钟没有提醒我明天提交报告。",
    "取消通知我明天提交报告。",
    "不要设置闹钟提醒我明天提交报告。",
    "不需要提醒我明天提交报告。",
    "取消提醒我明天提交报告。",
    "我不需要明天提交报告。",
  ];
  for (const transcript of examples) {
    assert.deepEqual(sanitizeIntentOutput(emptyIntents(), transcript), emptyIntents(), transcript);
  }

  assert.equal(
    sanitizeIntentOutput(emptyIntents(), "提醒我处理还没有提交的报告。").tasks.length,
    1,
  );
});

test("negated nested action items are removed from an otherwise valid task", () => {
  const transcript = "I must prepare the meeting notes. Do not notify me to submit the draft tomorrow.";
  const sanitized = sanitizeIntentOutput({
    tasks: [{
      title: "Prepare the meeting notes",
      actionItems: [{ title: "Notify me to submit the draft tomorrow" }],
    }],
  }, transcript);

  assert.equal(sanitized.tasks.length, 1);
  assert.deepEqual(sanitized.tasks[0].actionItems, []);
});

test("a completed fact does not suppress a later task in the same sentence", () => {
  const examples = [
    "I submitted the draft, but remind me to submit the final version on Friday.",
    "I submitted the draft but remind me to submit the final version on Friday.",
    "I submitted the draft and I need to submit the final version on Friday.",
    "I submitted the draft and I must submit the final version on Friday.",
    "I submitted the draft and I will submit the final version on Friday.",
    "I submitted the draft and remind me to submit the final version on Friday.",
    "我已经提交初稿，但提醒我周五提交终稿。",
    "我已经提交初稿但提醒我周五提交终稿。",
    "我已经提交初稿然后需要周五提交终稿。",
  ];
  for (const transcript of examples) {
    assert.equal(sanitizeIntentOutput(emptyIntents(), transcript).tasks.length, 1, transcript);
  }
});

test("a stated lead time resolves to the actionable reminder date", () => {
  const reference = new Date("2026-08-26T10:00:00+01:00");
  assert.equal(
    resolveCoreNoteTime("9 月 10 日汇报，提前 3 天提醒我", reference)?.normalized,
    "2026-09-07",
  );
  assert.match(
    resolveCoreNoteTime("9月10日14:00汇报，提前3天上午9点提醒我", reference)?.normalized ?? "",
    /^2026-09-07T09:00:00/u,
  );
  assert.match(
    resolveCoreNoteTime("September 10 at 2pm presentation; remind me three days before at 9am", reference)?.normalized ?? "",
    /^2026-09-07T09:00:00/u,
  );
  assert.match(
    resolveCoreNoteTime("Remind me at 9am, three days before the September 10 at 2pm presentation", reference)?.normalized ?? "",
    /^2026-09-07T09:00:00/u,
  );
  assert.match(
    resolveCoreNoteTime("At 9am three days before the September 10 presentation at 2pm, remind me", reference)?.normalized ?? "",
    /^2026-09-07T09:00:00/u,
  );
  assert.match(
    resolveCoreNoteTime("提前3天上午9点提醒我9月10日14:00汇报", reference)?.normalized ?? "",
    /^2026-09-07T09:00:00/u,
  );
  assert.match(
    resolveCoreNoteTime("9月10日14:00汇报，提醒我提前3天上午9点", reference)?.normalized ?? "",
    /^2026-09-07T09:00:00/u,
  );
  assert.match(
    resolveCoreNoteTime("At 9am three days before, remind me about September 10 at 2pm", reference)?.normalized ?? "",
    /^2026-09-07T09:00:00/u,
  );
});

test("an explicit actionable date wins over next-month context", () => {
  const reference = new Date("2026-08-26T10:00:00+01:00");
  assert.equal(
    resolveCoreNoteTime(
      "我下个月九月十号要去客户现场做汇报，麻烦提前三天提醒我准备材料。",
      reference,
    )?.normalized,
    "2026-09-07",
  );
});

test("traditional Chinese relative hours support compound numerals", () => {
  const reference = new Date("2026-08-26T10:00:00+01:00");
  assert.match(
    resolveCoreNoteTime("二十小時後", reference)?.normalized ?? "",
    /^2026-08-27T06:00:00/u,
  );
});

test("grounded task recovery restores an explicit date omitted by the local model", () => {
  const transcript = "I must submit the report by August 28th.";
  const recovered = sanitizeIntentOutput({
    tasks: [{
      title: "Submit the report",
      description: null,
      startsAtExpression: null,
      dueAtExpression: null,
      recurrence: null,
      actionItems: [],
    }],
  }, transcript);

  assert.equal(recovered.tasks.length, 1);
  assert.match(recovered.tasks[0].dueAtExpression ?? "", /August 28th/u);
});

test("many genuine tasks survive batching and merge without an arbitrary item cap", () => {
  const transcript = Array.from(
    { length: 16 },
    (_, index) => `Person ${index + 1} must submit report ${index + 1} by ${index + 1} September 2026.`,
  ).join(" ");
  const sanitizedBatches = splitIntentTranscript(transcript).map((chunk) => {
    const tasks = Array.from(chunk.matchAll(/Person (\d+) must submit report (\d+) by (\d+ September 2026)\./gu))
      .map((match) => ({ title: `Person ${match[1]} must submit report ${match[2]}`, dueAtExpression: match[3], actionItems: [] }));
    return sanitizeIntentOutput({ tasks }, chunk);
  });

  const merged = mergeIntentOutputs(sanitizedBatches);
  assert.equal(merged.tasks.length, 16);
});

test("merged intent batches deduplicate repeated boundary results", () => {
  const repeated = {
    tasks: [{ title: "Submit report", dueAtExpression: "Friday", actionItems: [] }],
  };
  const merged = mergeIntentOutputs([repeated, repeated, emptyIntents()]);
  assert.equal(merged.tasks.length, 1);
});

test("content fallback remains useful and bounded when a model never closes JSON", () => {
  const transcript = Array.from({ length: 20 }, (_, index) => `Fact ${index + 1} is recorded.`).join(" ");
  const fallback = fallbackContentFromTranscript(transcript);
  assert.ok(fallback.summary.length > 0);
  assert.ok(fallback.summary.length <= 800);
  assert.ok(fallback.keyPoints.length > 0);
  assert.ok(fallback.keyPoints.length <= 8);
});

test("CoreNoteInsightService defaults to one structured completion and keeps adaptive generation as fallback", async () => {
  const service = await readFile(
    new URL("../src/services/core-note-insight-service.ts", import.meta.url),
    "utf8",
  );
  const noteDetail = await readFile(
    new URL("../src/app/notes/[noteId].tsx", import.meta.url),
    "utf8",
  );

  assert.match(service, /runAdaptiveStructuredBatches/);
  assert.match(service, /structuredSchema/);
  assert.match(service, /generateStructured/);
  assert.match(service, /Single-stage pipeline completed/);
  assert.match(service, /Falling back to content and batched tasks/);
  assert.match(service, /promptTokens > maxPrompt/);
  assert.match(service, /completionHitOutputLimit/);
  assert.match(service, /splitIntentTranscript/);
  assert.match(service, /sanitizeAdaptiveIntentBatches/);
  assert.match(service, /hitOutputLimit/);
  assert.match(service, /stoppedLimit/);
  assert.match(service, /annotateCoreNoteDates\(annotateTaskRecurrences\(input, reference\.instant\), reference\.instant\)/);
  assert.match(service, /stripCoreNoteDateAnnotations/);
  assert.match(noteDetail, /coreNoteInsightService\.generate\([\s\S]*?state\.note\.getCreatedAt\(\)/);
});

test("Structured Note streaming only builds changed previews after throttling", async () => {
  const service = await readFile(
    new URL("../src/services/core-note-insight-service.ts", import.meta.url),
    "utf8",
  );

  assert.match(service, /publishStreamingPreview/);
  assert.match(service, /sameCoreInsightPreview/);
  assert.match(service, /previousStatus !== state\.status/);
  assert.match(service, /< 100/);
  assert.doesNotMatch(service, /publishPartial/);
});

test("single-stage schema preserves the stable task-only contract", async () => {
  const service = await readFile(
    new URL("../src/services/core-note-insight-service.ts", import.meta.url),
    "utf8",
  );

  for (const field of [
    "summary", "keyPoints", "tasks", "actionItems", "recurrence",
    "description", "startsAtExpression", "dueAtExpression",
  ]) assert.match(service, new RegExp(field));
  assert.match(service, /status: "pending"/);
  assert.match(service, /completedAt: null/);
  assert.match(service, /resolveCoreNoteTime\(item\.startsAtExpression/);
  assert.match(service, /resolveCoreNoteTime\(item\.dueAtExpression/);
  assert.doesNotMatch(service, /remindAtExpression|endsAtExpression|calendarIntents/);
});

test("Structured Note key points prefer a concise selection and are schema-capped at six", async () => {
  const service = await readFile(
    new URL("../src/services/core-note-insight-service.ts", import.meta.url),
    "utf8",
  );

  assert.match(service, /Prefer 3 to 5 key points for an ordinary note/);
  assert.match(service, /Use 1 or 2 when the note contains little meaningful information/);
  assert.match(service, /Never return more than 6 key points/);
  assert.match(service, /Merge semantically related information instead of extracting sentence by sentence/);
  assert.match(service, /omitting it would materially reduce the user's understanding/);
  assert.match(service, /keyPoints: \{ type: "array", items: \{ type: "string" \}, maxItems: 6 \}/);
  assert.doesNotMatch(service, /Select at most 12 non-overlapping items/);
});
