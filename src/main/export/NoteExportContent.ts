import path from 'path';
import type {
  CalendarIntent,
  InsightItem,
  InsightTask,
} from '@shared/types/KnowledgeGenerationTypes';
import type {
  NoteExportBlock,
  NoteExportData,
  NoteExportLayout,
} from './NoteExportData';

type ExportLanguage = NoteExportLayout['language'];

type ExportLabels = {
  archive: string;
  workspace: string;
  noteType: string;
  created: string;
  updated: string;
  exported: string;
  pinned: string;
  audio: string;
  yes: string;
  no: string;
  transcript: string;
  structuredNote: string;
  summary: string;
  keyPoints: string;
  tasks: string;
  actionItems: string;
  unassignedActions: string;
  reminders: string;
  calendarEvents: string;
  status: string;
  startsAt: string;
  dueAt: string;
  endsAt: string;
  remindAt: string;
  allDay: string;
  timezone: string;
  completedAt: string;
  externalReference: string;
  model: string;
  generatedAt: string;
  scenarioKnowledge: string;
  template: string;
  templateSource: string;
  builtin: string;
  custom: string;
  todos: string;
  subnotes: string;
  generatedKnowledge: string;
  contentType: string;
  aiConversations: string;
  messageCount: string;
  user: string;
  assistant: string;
  system: string;
  pending: string;
  completed: string;
  cancelled: string;
  pinnedMarker: string;
};

const ZH: ExportLabels = {
  archive: '完整笔记档案',
  workspace: '工作空间',
  noteType: '笔记类型',
  created: '创建时间',
  updated: '更新时间',
  exported: '导出时间',
  pinned: '已置顶',
  audio: '关联录音',
  yes: '是',
  no: '否',
  transcript: '原始转写',
  structuredNote: '结构化笔记',
  summary: '摘要',
  keyPoints: '关键要点',
  tasks: '任务与行动计划',
  actionItems: '行动项',
  unassignedActions: '未归属行动项',
  reminders: '提醒',
  calendarEvents: '日程安排',
  status: '状态',
  startsAt: '开始时间',
  dueAt: '截止时间',
  endsAt: '结束时间',
  remindAt: '提醒时间',
  allDay: '全天',
  timezone: '时区',
  completedAt: '完成时间',
  externalReference: '外部关联',
  model: '生成模型',
  generatedAt: '生成时间',
  scenarioKnowledge: '场景知识',
  template: '模板',
  templateSource: '模板来源',
  builtin: '内置',
  custom: '自定义',
  todos: '待办事项',
  subnotes: '子笔记',
  generatedKnowledge: '历史模板输出',
  contentType: '内容类型',
  aiConversations: '关联 AI 对话',
  messageCount: '消息数',
  user: '用户',
  assistant: 'AI 助手',
  system: '系统',
  pending: '待处理',
  completed: '已完成',
  cancelled: '已取消',
  pinnedMarker: '置顶',
};

const EN: ExportLabels = {
  archive: 'Complete note archive',
  workspace: 'Workspace',
  noteType: 'Note type',
  created: 'Created',
  updated: 'Updated',
  exported: 'Exported',
  pinned: 'Pinned',
  audio: 'Linked recording',
  yes: 'Yes',
  no: 'No',
  transcript: 'Transcript',
  structuredNote: 'Structured note',
  summary: 'Summary',
  keyPoints: 'Key points',
  tasks: 'Tasks and action plan',
  actionItems: 'Action items',
  unassignedActions: 'Unassigned action items',
  reminders: 'Reminders',
  calendarEvents: 'Calendar events',
  status: 'Status',
  startsAt: 'Starts',
  dueAt: 'Due',
  endsAt: 'Ends',
  remindAt: 'Remind at',
  allDay: 'All day',
  timezone: 'Timezone',
  completedAt: 'Completed at',
  externalReference: 'External reference',
  model: 'Model',
  generatedAt: 'Generated',
  scenarioKnowledge: 'Scenario knowledge',
  template: 'Template',
  templateSource: 'Template source',
  builtin: 'Built in',
  custom: 'Custom',
  todos: 'To-dos',
  subnotes: 'Sub-notes',
  generatedKnowledge: 'Previous template outputs',
  contentType: 'Content type',
  aiConversations: 'Linked AI conversations',
  messageCount: 'Messages',
  user: 'User',
  assistant: 'AI assistant',
  system: 'System',
  pending: 'Pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
  pinnedMarker: 'Pinned',
};

const formatDate = (value: string, language: ExportLanguage): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function rawTimeExpression(
  item: InsightItem,
  field: 'startsAt' | 'dueAt' | 'endsAt' | 'remindAt',
): string | null {
  const metadata = item.metadata as Record<string, unknown>;
  const direct = metadata[field];
  if (direct && typeof direct === 'object') {
    return text((direct as Record<string, unknown>).raw);
  }
  const expressions = metadata.timeExpressions;
  if (expressions && typeof expressions === 'object') {
    const value = (expressions as Record<string, unknown>)[field];
    if (value && typeof value === 'object') {
      return text((value as Record<string, unknown>).raw);
    }
  }
  return null;
}

function localizedStatus(
  status: InsightItem['status'],
  labels: ExportLabels,
): string {
  if (status === 'completed') return labels.completed;
  if (status === 'cancelled') return labels.cancelled;
  return labels.pending;
}

function appendTime(
  blocks: NoteExportBlock[],
  label: string,
  normalized: string | null,
  raw: string | null,
  language: ExportLanguage,
): void {
  const value = normalized ? formatDate(normalized, language) : raw;
  if (!value) return;
  blocks.push({
    kind: 'definition',
    label,
    value: raw && normalized ? `${value} (${raw})` : value,
  });
}

function insightListText(
  item: InsightItem,
  labels: ExportLabels,
  language: ExportLanguage,
): string {
  const parts = [item.title];
  if (item.description?.trim()) parts.push(item.description.trim());
  parts.push(`${labels.status}: ${localizedStatus(item.status, labels)}`);
  const times: Array<{
    label: string;
    normalized: string | null;
    field: 'startsAt' | 'dueAt';
  }> = [
    { label: labels.startsAt, normalized: item.startsAt, field: 'startsAt' },
    { label: labels.dueAt, normalized: item.dueAt, field: 'dueAt' },
  ];
  times.forEach(({ label, normalized, field }) => {
    const raw = rawTimeExpression(item, field);
    const value = normalized ? formatDate(normalized, language) : raw;
    if (value)
      parts.push(
        `${label}: ${raw && normalized ? `${value} (${raw})` : value}`,
      );
  });
  if (item.completedAt) {
    parts.push(
      `${labels.completedAt}: ${formatDate(item.completedAt, language)}`,
    );
  }
  if (item.externalSystem || item.externalId) {
    parts.push(
      `${labels.externalReference}: ${[item.externalSystem, item.externalId]
        .filter(Boolean)
        .join(' / ')}`,
    );
  }
  return parts.join(' - ');
}

function appendInsightDetails(
  blocks: NoteExportBlock[],
  item: InsightItem,
  labels: ExportLabels,
  language: ExportLanguage,
): void {
  if (item.description?.trim()) {
    blocks.push({ kind: 'paragraph', text: item.description.trim() });
  }
  blocks.push({
    kind: 'definition',
    label: labels.status,
    value: localizedStatus(item.status, labels),
  });
  appendTime(
    blocks,
    labels.startsAt,
    item.startsAt,
    rawTimeExpression(item, 'startsAt'),
    language,
  );
  appendTime(
    blocks,
    labels.dueAt,
    item.dueAt,
    rawTimeExpression(item, 'dueAt'),
    language,
  );
  if (item.completedAt) {
    blocks.push({
      kind: 'definition',
      label: labels.completedAt,
      value: formatDate(item.completedAt, language),
    });
  }
  if (item.externalSystem || item.externalId) {
    blocks.push({
      kind: 'definition',
      label: labels.externalReference,
      value: [item.externalSystem, item.externalId].filter(Boolean).join(' / '),
    });
  }
}

function appendTasks(
  blocks: NoteExportBlock[],
  tasks: InsightTask[],
  labels: ExportLabels,
  language: ExportLanguage,
): void {
  if (tasks.length === 0) return;
  blocks.push({ kind: 'heading', level: 2, text: labels.tasks });
  tasks.forEach((task) => {
    blocks.push({ kind: 'heading', level: 3, text: task.title });
    appendInsightDetails(blocks, task, labels, language);
    if (task.actionItems.length > 0) {
      blocks.push({
        kind: 'paragraph',
        text: labels.actionItems,
        style: 'muted',
      });
      task.actionItems.forEach((item) => {
        blocks.push({
          kind: 'listItem',
          text: insightListText(item, labels, language),
          level: 1,
          checked: item.status === 'completed',
        });
      });
    }
  });
}

function appendCalendarItems(
  blocks: NoteExportBlock[],
  items: CalendarIntent[],
  kind: CalendarIntent['kind'],
  heading: string,
  labels: ExportLabels,
  language: ExportLanguage,
): void {
  const matching = items.filter((item) => item.kind === kind);
  if (matching.length === 0) return;
  blocks.push({ kind: 'heading', level: 2, text: heading });
  matching.forEach((item) => {
    blocks.push({ kind: 'heading', level: 3, text: item.title });
    appendInsightDetails(blocks, item, labels, language);
    appendTime(
      blocks,
      labels.endsAt,
      item.endsAt,
      rawTimeExpression(item, 'endsAt'),
      language,
    );
    appendTime(
      blocks,
      labels.remindAt,
      item.remindAt,
      rawTimeExpression(item, 'remindAt'),
      language,
    );
    blocks.push({
      kind: 'definition',
      label: labels.allDay,
      value: item.allDay ? labels.yes : labels.no,
    });
    if (item.timezone) {
      blocks.push({
        kind: 'definition',
        label: labels.timezone,
        value: item.timezone,
      });
    }
  });
}

function roleLabel(role: string, labels: ExportLabels): string {
  if (role === 'user') return labels.user;
  if (role === 'assistant') return labels.assistant;
  if (role === 'system') return labels.system;
  return role;
}

export function buildNoteExportLayout(
  data: NoteExportData,
  language: ExportLanguage,
  exportedAt: Date = new Date(),
): NoteExportLayout {
  const labels = language === 'zh' ? ZH : EN;
  const blocks: NoteExportBlock[] = [
    { kind: 'definition', label: labels.workspace, value: data.workspaceName },
  ];
  if (data.typeCategory) {
    blocks.push({
      kind: 'definition',
      label: labels.noteType,
      value: data.typeCategory,
    });
  }
  blocks.push(
    {
      kind: 'definition',
      label: labels.created,
      value: formatDate(data.createdAt, language),
    },
    {
      kind: 'definition',
      label: labels.updated,
      value: formatDate(data.updatedAt, language),
    },
    {
      kind: 'definition',
      label: labels.pinned,
      value: data.isPinned ? labels.yes : labels.no,
    },
  );
  if (data.audioRelativePath) {
    blocks.push({
      kind: 'definition',
      label: labels.audio,
      value: path.basename(data.audioRelativePath),
    });
  }
  blocks.push(
    {
      kind: 'definition',
      label: labels.exported,
      value: formatDate(exportedAt.toISOString(), language),
    },
    { kind: 'divider' },
    { kind: 'heading', level: 1, text: labels.transcript },
    { kind: 'paragraph', text: data.transcript || '-', style: 'body' },
  );

  const structured = data.structuredNote;
  if (structured) {
    blocks.push(
      { kind: 'heading', level: 1, text: labels.structuredNote },
      {
        kind: 'definition',
        label: labels.model,
        value: structured.modelId,
      },
      {
        kind: 'definition',
        label: labels.generatedAt,
        value: formatDate(structured.createdAt, language),
      },
      {
        kind: 'definition',
        label: labels.updated,
        value: formatDate(structured.updatedAt, language),
      },
    );
    if (structured.summary.trim()) {
      blocks.push(
        { kind: 'heading', level: 2, text: labels.summary },
        { kind: 'paragraph', text: structured.summary, style: 'lead' },
      );
    }
    if (structured.keyPoints.length > 0) {
      blocks.push({ kind: 'heading', level: 2, text: labels.keyPoints });
      structured.keyPoints.forEach((point) =>
        blocks.push({ kind: 'listItem', text: point }),
      );
    }
    appendTasks(blocks, structured.tasks, labels, language);
    if (structured.unassignedActionItems.length > 0) {
      blocks.push({
        kind: 'heading',
        level: 2,
        text: labels.unassignedActions,
      });
      structured.unassignedActionItems.forEach((item) => {
        blocks.push({ kind: 'heading', level: 3, text: item.title });
        appendInsightDetails(blocks, item, labels, language);
      });
    }
    appendCalendarItems(
      blocks,
      structured.calendarIntents,
      'reminder',
      labels.reminders,
      labels,
      language,
    );
    appendCalendarItems(
      blocks,
      structured.calendarIntents,
      'calendar',
      labels.calendarEvents,
      labels,
      language,
    );
  }

  const scenario = data.scenarioKnowledge;
  if (scenario) {
    blocks.push(
      { kind: 'heading', level: 1, text: labels.scenarioKnowledge },
      {
        kind: 'definition',
        label: labels.template,
        value: scenario.templateName,
      },
      {
        kind: 'definition',
        label: labels.templateSource,
        value:
          scenario.templateSource === 'custom' ? labels.custom : labels.builtin,
      },
      { kind: 'definition', label: labels.model, value: scenario.modelId },
      {
        kind: 'definition',
        label: labels.generatedAt,
        value: formatDate(scenario.createdAt, language),
      },
      {
        kind: 'definition',
        label: labels.updated,
        value: formatDate(scenario.updatedAt, language),
      },
    );
    scenario.sections.forEach((section) => {
      blocks.push({ kind: 'heading', level: 2, text: section.title });
      section.items.forEach((item) =>
        blocks.push({ kind: 'listItem', text: item }),
      );
    });
  }

  if (data.todos.length > 0) {
    blocks.push({ kind: 'heading', level: 1, text: labels.todos });
    data.todos.forEach((todo) => {
      const details = [
        todo.title,
        todo.dateString,
        todo.isPinned ? labels.pinnedMarker : null,
      ]
        .filter(Boolean)
        .join(' - ');
      blocks.push({
        kind: 'listItem',
        text: details,
        checked: todo.isCompleted,
      });
    });
  }

  if (data.subnotes.length > 0) {
    blocks.push({ kind: 'heading', level: 1, text: labels.subnotes });
    data.subnotes.forEach((subnote) => {
      blocks.push(
        { kind: 'heading', level: 2, text: subnote.contentType },
        {
          kind: 'paragraph',
          text: formatDate(subnote.createdAt, language),
          style: 'muted',
        },
        { kind: 'paragraph', text: subnote.content },
      );
    });
  }

  if (data.knowledgeOutputs.length > 0) {
    blocks.push({
      kind: 'heading',
      level: 1,
      text: labels.generatedKnowledge,
    });
    data.knowledgeOutputs.forEach((output) => {
      blocks.push(
        { kind: 'heading', level: 2, text: output.templateName },
        {
          kind: 'definition',
          label: labels.contentType,
          value: output.contentType,
        },
        {
          kind: 'definition',
          label: labels.generatedAt,
          value: formatDate(output.createdAt, language),
        },
        {
          kind: 'definition',
          label: labels.updated,
          value: formatDate(output.updatedAt, language),
        },
        { kind: 'paragraph', text: output.content },
      );
    });
  }

  if (data.conversations.length > 0) {
    blocks.push({ kind: 'heading', level: 1, text: labels.aiConversations });
    data.conversations.forEach((conversation) => {
      blocks.push(
        { kind: 'heading', level: 2, text: conversation.name },
        {
          kind: 'definition',
          label: labels.messageCount,
          value: String(conversation.messages.length),
        },
        {
          kind: 'definition',
          label: labels.created,
          value: formatDate(conversation.createdAt, language),
        },
        {
          kind: 'definition',
          label: labels.updated,
          value: formatDate(conversation.updatedAt, language),
        },
      );
      conversation.messages.forEach((message) => {
        blocks.push(
          {
            kind: 'heading',
            level: 3,
            text: `${roleLabel(message.role, labels)} - ${formatDate(
              message.createdAt,
              language,
            )}`,
          },
          { kind: 'paragraph', text: message.content },
        );
      });
    });
  }

  return {
    language,
    title: data.title,
    subtitle: labels.archive,
    blocks,
  };
}

export function getNoteExportPlainText(layout: NoteExportLayout): string {
  return [
    layout.title,
    layout.subtitle,
    ...layout.blocks.flatMap((block) => {
      if (block.kind === 'divider') return [];
      if (block.kind === 'definition') return [block.label, block.value];
      return [block.text];
    }),
  ].join('\n');
}
