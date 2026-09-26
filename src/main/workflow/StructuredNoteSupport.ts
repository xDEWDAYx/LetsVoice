import { KnowledgeOutput } from '@shared/entities/KnowledgeOutput';
import { KnowledgeTemplate } from '@shared/entities/KnowledgeTemplate';
import { Note } from '@shared/entities/Note';
import { KnowledgeOutputDTO } from './StructuredNoteTypes';

const MAX_TRANSCRIPT_CHARACTERS = 15_000;

/** IPC 的数字参数需先验证，避免把无效 ID 传入数据库查询。 */
export function normalizeWorkflowId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`无效的${label} ID / Invalid ID`);
  }
  return id;
}

/** 将模板和笔记转换为受长度限制的本地模型消息。 */
export function buildStructuredNoteMessages(
  note: Note,
  template: KnowledgeTemplate,
) {
  const transcript = note.getTranscript().trim();
  if (!transcript) throw new Error('笔记还没有可整理的文字 / Note is empty');
  const clipped = transcript.slice(0, MAX_TRANSCRIPT_CHARACTERS);

  return [
    {
      role: 'system',
      content: `你是本地笔记整理助手。只依据用户提供的笔记，按以下模板要求输出 Markdown；不要补充笔记中没有的事实。\n\n模板要求：\n${template.getPrompt()}`,
    },
    {
      role: 'user',
      content: `笔记名称：${note.getName() ?? '未命名笔记'}\n\n笔记内容：\n${clipped}`,
    },
  ];
}

export function serializeKnowledgeOutput(
  output: KnowledgeOutput,
): KnowledgeOutputDTO {
  return {
    id: output.getId(),
    noteId: output.getNoteId(),
    templateId: output.getTemplateId(),
    contentType: 'text/markdown',
    content: output.getContent(),
    createdAt: output.getCreatedAt().toISOString(),
    updatedAt: output.getUpdatedAt().toISOString(),
  };
}
